import { mediaUnits, imageVariables } from "../server/content-contract";
import { buildImageAudioVideo } from "../server/image-audio-video";
import {
  generateReadyPost,
  generateDirectCarousel,
  generateTemplatePost,
} from "./posting-images";
import {
  productionLabPrompt,
  wholeTextProductionPrompt,
} from "../server/lab-production";
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { ROOT } from "../server/config";
import { outputRoot } from "../server/output-paths";
import { NewsMediaStore } from "../server/news-media-store";
import {
  type NewsMediaJob,
  newsContent,
  newsCaption,
  newsPrerequisite,
  newsPostImagePrompt,
} from "../server/news-production-domain";
import { Store } from "../server/store";
import type { NewsArticle } from "../server/news-store";
import { validateNewsArticle } from "../server/news";
import {
  type BookSettings,
  baseKind,
  sentenceJob,
} from "../server/book-settings";
import { bestAsset, panelTokens, tokenize } from "../server/stock-match";
import { stripMarkdownEmphasis } from "../server/stock-prompts";
import { generateStock } from "./stock-generator";
import { generateCodexImage } from "../server/codex-image";
import {
  accounts,
  publish,
  publishCarousel,
  postStatus,
} from "../server/providers";
import { sanitizeForTts } from "../server/tts-text";
import { edgeTts, newsTtsConfig } from "../server/edge-tts";
import {
  renderPanel,
  pickTemplate,
  renderSubtitleFrame,
  subtitleLayout,
  SUBTITLE_VERTICAL,
  SUBTITLE_LANDSCAPE,
} from "../server/render";
import { buildReels, VERTICAL, LANDSCAPE } from "../server/video";
import { SOURCE } from "../server/templates";
import { selectInstagramAccount } from "../server/instagram-account";
const JPEG = {
  quality: 90,
  mozjpeg: true,
  chromaSubsampling: "4:4:4",
} as const;
const relative = (file: string) => path.relative(ROOT, file);
function publicFile(file: string) {
  const dir = path.join(ROOT, "output/public");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const name =
    createHash("sha256").update(file).digest("hex").slice(0, 32) +
    path.extname(file);
  copyFileSync(path.join(ROOT, file), path.join(dir, name));
  return `${process.env.PUBLIC_ORIGIN || "https://ncpost.nuscode.id"}/pub/${name}`;
}
export async function pollNewsPublications(store: NewsMediaStore) {
  for (const row of await store.pendingPublications()) {
    const data = JSON.parse(row.data);
    try {
      const r = await postStatus(data.requestId);
      await store.updatePublication(row.news_id, row.kind, data.requestId, {
        ...data,
        status: String(r.status),
        mediaId: r.mediaId ?? null,
      });
    } catch {}
  }
}
export async function runNewsMediaJob(
  store: NewsMediaStore,
  assets: Store,
  j: NewsMediaJob,
) {
  const work = path.join(
    outputRoot(),
    "berita/media",
    String(j.news_id),
    String(j.revision),
    `${j.id}-${j.attempts}`,
  );
  mkdirSync(work, { recursive: true, mode: 0o700 });
  const heartbeat = setInterval(
    () => store.heartbeat(j).catch(() => {}),
    60000,
  );
  try {
    const [rows]: any = await store.db.query(
      "SELECT * FROM news_articles WHERE id=?",
      [j.news_id],
    );
    const n: NewsArticle = rows[0];
    if (!n || n.state !== "completed" || n.attempts !== j.revision)
      throw Error("Snapshot artikel berita berubah");
    const settings: BookSettings = JSON.parse(j.settings);
    const v = validateNewsArticle(n.article, settings.articleConfig);
    if (!v.ok) throw Error(v.errors.join("; "));
    const content = newsContent(n.article);
    const labFor = (
      target: string,
      text: string,
      variables: Record<string, string> = {},
    ) =>
      productionLabPrompt(store.db, settings, target, {
        ...imageVariables(n.article, settings.imageUnit || "paragraph", 0),
        teks: text,
        artikel: content.paragraphs.join("\n\n"),
        bab: JSON.stringify(n.title),
        buku: "",
        quote: text,
        ...variables,
      });
    const p = await store.detail(n.id, j.revision);
    const prerequisite = newsPrerequisite(j.kind, p, settings, n.article);
    if (prerequisite) throw Error(prerequisite);
    const renderedAt = new Date().toISOString();
    if (j.kind === "POST_IMAGE") {
      const lab = await wholeTextProductionPrompt(store.db, settings, {
        ...imageVariables(n.article, "article", 0),
        teks: content.paragraphs.join("\n\n"),
        artikel: content.paragraphs.join("\n\n"),
        bab: n.title,
        buku: "",
        quote: "",
      });
      const prompt = lab?.prompt || newsPostImagePrompt(n.article);
      const file = path.join(work, "gambar-post.jpg");
      writeFileSync(path.join(work, "prompt.md"), prompt, { mode: 0o600 });
      const postingOptions = {
        file,
        work,
        title: content.title,
        text: content.paragraphs.join("\n\n"),
        footer: `Berita · ${n.title}`,
        kind: settings.wholeTextImageKind || "IMAGE_HORIZONTAL",
        lab,
      };
      const image =
        settings.singleImageMode === "template"
          ? await generateTemplatePost(postingOptions)
          : settings.singleImageMode === "direct"
            ? await generateReadyPost({
                ...postingOptions,
                lab,
                style: "Buat infografis editorial yang mudah dibaca.",
              })
            : await generateCodexImage(
                prompt,
                work,
                file,
                "bebas",
                ...(lab ? ([lab.images] as [string[]]) : []),
              );
      await store.complete(j, {
        file: relative(file),
        width: image.width,
        height: image.height,
        prompt: "prompt" in image ? image.prompt : prompt,
        mode: settings.singleImageMode,
        renderedAt,
      });
      return;
    }
    if (j.kind.includes("IMAGE_")) {
      const perSentence = j.kind.startsWith("S_");
      const kind = baseKind(j.kind);
      const unit =
        settings.imageUnit || (perSentence ? "sentence" : "paragraph");
      const units = mediaUnits(n.article, unit);
      const items = units.map((entry) => ({
        heading:
          unit === "paragraph" ? content.heading || content.title : entry.text,
        paragraph: unit === "paragraph" ? entry.text : "",
      }));
      for (const [i, item] of items.entries()) {
        const taken = (await store.detail(n.id, j.revision)).stock.filter(
          (b) => b.kind === j.kind,
        );
        if (taken.some((b) => b.panel === i + 1)) continue;
        const lab = await labFor(
          kind,
          item.paragraph ? `${item.heading} — ${item.paragraph}` : item.heading,
          imageVariables(n.article, unit, i),
        );
        const match =
          j.force_new || lab
            ? undefined
            : bestAsset(
                perSentence
                  ? tokenize([item.heading, ...v.tags].join(" "))
                  : panelTokens(item.heading, item.paragraph, v.tags),
                await assets.assets(kind),
                new Set(taken.map((b) => b.asset_id)),
              );
        const id =
          match?.asset.id ??
          (await generateStock(
            assets,
            kind,
            item.heading,
            item.paragraph,
            work,
            i + 1,
            lab,
          ));
        if (!(await store.bind(j, i + 1, id)))
          throw Error("Job gambar sudah tidak aktif");
      }
      await store.complete(j);
      return;
    }
    if (j.kind === "TTS_KALIMAT") {
      const config = newsTtsConfig();
      const sentences = [];
      for (const [i, s] of mediaUnits(
        n.article,
        settings.imageUnit || "sentence",
      ).entries()) {
        const file = path.join(
          work,
          `kalimat_${String(i + 1).padStart(2, "0")}.mp3`,
        );
        const text = sanitizeForTts(s.text);
        await edgeTts(text, file, config);
        sentences.push({
          sentence: i + 1,
          paragraph: s.paragraph,
          narration_text: text,
          file: relative(file),
        });
      }
      await store.complete(j, {
        provider: config.provider,
        voice: config.voice,
        rate: config.rate,
        sentences,
        renderedAt,
      });
      return;
    }
    if (j.kind === "PANEL") {
      if (settings.carouselMode === "direct") {
        const manifest = await generateDirectCarousel({
          dir: work,
          work,
          title: content.title,
          paragraphs: mediaUnits(
            n.article,
            settings.imageUnit || "paragraph",
          ).map((entry) => stripMarkdownEmphasis(entry.text)),
          footer: `Berita Teknologi · #${n.id}`,
          kind: settings.panelVertical || settings.panelHorizontal!,
          labFor,
          variables: (index) =>
            imageVariables(n.article, settings.imageUnit || "paragraph", index),
        });
        await store.complete(j, {
          ...manifest,
          panels: manifest.panels.map((p) => ({
            ...p,
            file: relative(p.file),
          })),
          closing: manifest.closing ? relative(manifest.closing) : null,
          sources: {
            panelHorizontal: settings.panelHorizontal,
            panelVertical: settings.panelVertical,
          },
        });
        return;
      }
      const panels = [];
      const footer = `Berita Teknologi · #${n.id}`;
      for (const [i, paragraph] of mediaUnits(
        n.article,
        settings.imageUnit || "paragraph",
      )
        .map((entry) => entry.text)
        .entries()) {
        const portrait = p.stock.find(
          (b) => b.kind === settings.panelVertical && b.panel === i + 1,
        );
        const t = pickTemplate(
          "",
          stripMarkdownEmphasis(paragraph),
          !!portrait,
          !!settings.panelHorizontal,
        );
        const image = t.vertical
          ? portrait
          : p.stock.find(
              (b) => b.kind === settings.panelHorizontal && b.panel === i + 1,
            );
        if (!image) throw Error(`Gambar panel ${i + 1} belum tersedia`);
        const file = path.join(work, `0${i + 1}-panel.jpg`);
        writeFileSync(
          file,
          await sharp(
            await renderPanel(
              t.id,
              i + 1,
              "",
              stripMarkdownEmphasis(paragraph),
              footer,
              path.join(ROOT, image.file),
            ),
          )
            .jpeg(JPEG)
            .toBuffer(),
        );
        panels.push({
          file: relative(file),
          asset_id: image.asset_id,
          template: t.id,
        });
      }
      const closing = path.join(
        work,
        `${String(panels.length + 1).padStart(2, "0")}-slide-penutup.jpg`,
      );
      const source = path.join(
        SOURCE,
        "asset/closing-slide/slide-penutup-final.png",
      );
      const meta = await sharp(source).metadata();
      if (meta.width !== 1080 || meta.height !== 1350)
        throw Error("Slide penutup bukan 1080×1350");
      await sharp(source).jpeg(JPEG).toFile(closing);
      await store.complete(j, {
        panels,
        closing: relative(closing),
        footer,
        sources: {
          panelHorizontal: settings.panelHorizontal,
          panelVertical: settings.panelVertical,
        },
        renderedAt,
      });
      return;
    }
    if (j.kind === "VIDEO_KALIMAT" || j.kind === "VIDEO_KALIMAT_H") {
      const horizontal = j.kind === "VIDEO_KALIMAT_H";
      const spec = horizontal ? SUBTITLE_LANDSCAPE : SUBTITLE_VERTICAL;
      const source = horizontal
        ? settings.sentenceVideoHKind!
        : settings.sentenceVideoKind!;
      const audio = p.outputs.TTS_KALIMAT;
      if (
        audio.sentences.length !==
        mediaUnits(n.article, settings.imageUnit || "sentence").length
      )
        throw Error("Audio tidak sesuai artikel");
      const direct =
        (horizontal
          ? settings.sentenceVideoHMode
          : settings.sentenceVideoMode) === "direct";
      if (direct) {
        const slides = mediaUnits(
          n.article,
          settings.imageUnit || "sentence",
        ).map((_, i) => {
          const binding = p.stock.find(
            (b) => b.kind === sentenceJob(source) && b.panel === i + 1,
          );
          if (!binding) throw Error(`Gambar kalimat ${i + 1} belum tersedia`);
          return {
            image: path.join(ROOT, binding.file),
            audio: path.join(ROOT, audio.sentences[i].file),
          };
        });
        const file = path.join(
          work,
          horizontal ? "video-h.mp4" : "video-v.mp4",
        );
        const result = await buildImageAudioVideo(
          slides,
          file,
          work,
          horizontal ? LANDSCAPE : VERTICAL,
        );
        await store.complete(j, {
          ...result,
          file: relative(file),
          source,
          renderedAt,
        });
        return;
      }
      const panels = [];
      for (const [i, s] of mediaUnits(
        n.article,
        settings.imageUnit || "sentence",
      ).entries()) {
        const binding = p.stock.find(
          (b) => b.kind === sentenceJob(source) && b.panel === i + 1,
        );
        if (!binding) throw Error(`Gambar kalimat ${i + 1} belum tersedia`);
        const layout = subtitleLayout(s.text, spec);
        const image = path.join(work, `kalimat-${i + 1}.png`);
        writeFileSync(
          image,
          await renderSubtitleFrame(
            path.join(ROOT, binding.file),
            layout,
            i === 0
              ? {
                  heading: stripMarkdownEmphasis(v.title),
                  label: `Berita Teknologi · #${n.id}`,
                }
              : undefined,
            spec,
          ),
        );
        panels.push({
          image,
          audio: path.join(ROOT, audio.sentences[i].file),
          layout,
          // Title is visual only; existing audio starts with the sentence,
          // so karaoke must not wait for a spoken title.
          heading: "",
          paragraph: s.text,
        });
      }
      const file = path.join(work, horizontal ? "video-h.mp4" : "video-v.mp4");
      const result = await buildReels(
        panels,
        file,
        work,
        horizontal ? LANDSCAPE : VERTICAL,
        path.join(
          outputRoot(),
          "cache/news-timeline",
          String(n.id),
          String(j.revision),
          createHash("sha256")
            .update(JSON.stringify(audio))
            .digest("hex")
            .slice(0, 16),
        ),
      );
      await store.complete(j, {
        ...result,
        file: relative(file),
        source,
        renderedAt,
      });
      return;
    }
    if (j.kind === "POST_IG" || j.kind === "REELS_IG") {
      const old = p.outputs[j.kind];
      if (old && old.status !== "failed")
        throw Error("Publikasi sudah dikirim; periksa Instagram");
      const account = selectInstagramAccount(
        settings.instagramAccountId,
        await accounts(),
      );
      const requestId = `ncpost-news-${j.kind === "POST_IG" ? "post" : "reels"}-${n.id}-${j.id}`;
      const media =
        j.kind === "POST_IG"
          ? {
              imageUrls: [
                ...p.outputs.PANEL.panels.map((x: any) => x.file),
                p.outputs.PANEL.closing,
              ]
                .filter(Boolean)
                .map(publicFile),
            }
          : { videoUrl: publicFile(p.outputs.VIDEO_KALIMAT.file) };
      const caption = newsCaption(n.article);
      const record = {
        requestId,
        igUserId: account.id,
        username: account.username,
        status: "processing",
        renderedAt,
        ...media,
      };
      if (!(await store.output(j, record)))
        throw Error("Job publikasi sudah tidak aktif");
      try {
        const r =
          j.kind === "POST_IG"
            ? await publishCarousel({
                requestId,
                igUserId: account.id,
                imageUrls: (media as any).imageUrls,
                caption,
              })
            : await publish({
                requestId,
                igUserId: account.id,
                videoUrl: (media as any).videoUrl,
                caption,
              });
        await store.complete(j, {
          ...record,
          status: String(r.status),
          mediaId: r.mediaId ?? null,
        });
      } catch (e) {
        // The request may have reached NC-WA. Preserve its ID and stop retries.
        await store.output(j, {
          ...record,
          status: "unknown",
          error: (e as Error).message,
        });
        throw e;
      }
      return;
    }
    throw Error("Jenis produksi berita tidak dikenal");
  } catch (e) {
    await store.fail(
      j,
      e instanceof Error ? e.message : "Produksi berita gagal",
    );
  } finally {
    clearInterval(heartbeat);
  }
}
