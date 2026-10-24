import { snapshotInstagram } from "../server/account-stats";
import { managerTick } from "../server/manager";
import {
  resolveVoice,
  generateTimedVoiceAudio,
  voiceRecipe,
} from "../server/voices";
import { workerConcurrency } from "../server/domain";
import { cancellableGeneration } from "../server/generation-cancel";
import { existsSync } from "node:fs";
import {
  configureMediaStock,
  sharedMedia,
  sharedVideo,
  resolveMedia,
} from "../server/media-stock";
import { sendInstagramPublication } from "./instagram-publication";
import { finishProcessTiming } from "../server/process-timing";
import { timingStage } from "../server/process-timing-domain";
import { mediaUnits, imageVariables } from "../server/content-contract";
import { generateConfiguredArticle } from "./configured-article";
import { generateStandaloneQuote } from "./quote";
import { quoteText, quoteInstruction } from "../server/quote-text";
import { buildImageAudioVideo } from "../server/image-audio-video";
import { publishZernio } from "../server/zernio-routes";
import {
  generateReadyPost,
  generateDirectCarousel,
  generateTemplatePost,
} from "./posting-images";
import { labImageKind } from "../server/lab-image-types";
import {
  productionLabPrompt,
  wholeTextProductionPrompt,
} from "../server/lab-production";
import { generateWholeTextImage } from "./text-image";
import { LabStore } from "../server/lab";
import { runLabJob } from "./lab";
import { NewsCronStore } from "../server/news-cron";
import { NewsMediaStore } from "../server/news-media-store";
import { runNewsMediaJob, pollNewsPublications } from "./news-media";
import { generateStock } from "./stock-generator";
import { NewsStore } from "../server/news-store";
import { runNewsJob } from "./news";
import { runJurnalisTest } from "./jurnalis";
import { live, withLive } from "../server/live";
import { NewsLabStore } from "../server/news-lab";
import { selectInstagramAccount } from "../server/instagram-account";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { initConfig, ROOT } from "../server/config";
import { Store, type Chapter, type Job } from "../server/store";
import { codex, editorReport, reviewChecks } from "../server/providers";
import {
  validateArticle,
  validateContentText,
  validateDraft,
  parseHook,
  mergeHook,
  partNumber,
  instagramCaption,
} from "../server/domain";
import {
  accounts,
  instagramSummary,
  publish,
  publishCarousel,
  postStatus,
  tts,
} from "../server/providers";
import { ttsNarration } from "../server/tts-text";
import { createHash } from "node:crypto";
import { generateCodexImage } from "../server/codex-image";
import { editorLint } from "../server/editor";
import {
  renderPanel,
  pickTemplate,
  renderSubtitleFrame,
  subtitleLayout,
  SUBTITLE_LANDSCAPE,
  SUBTITLE_VERTICAL,
} from "../server/render";
import { buildReels, LANDSCAPE, VERTICAL } from "../server/video";
import {
  articleWritePrompt,
  articleReviewPrompt,
  articleRevisePrompt,
  articleFormatPrompt,
  quotePrompt,
  hookPrompt,
  quoteImagePrompt,
} from "../server/prompts";
import { baseKind, isAnimation, sentenceJob } from "../server/book-settings";
import { ANIMATION_PRESET, buildAnimationVideo } from "../server/anim2d";
import { SOURCE } from "../server/templates";
import {
  audioDir,
  chapterDir,
  panelDir,
  quoteImagePath,
  videoPath,
} from "../server/output-paths";
import { panelHeading, stripMarkdownEmphasis } from "../server/stock-prompts";
import { panelTokens, tokenize } from "../server/stock-match";
initConfig();
const store = new Store();
configureMediaStock(store.db);
const newsStore = new NewsStore(store.db);
const labStore = new LabStore(store.db);
const newsMediaStore = new NewsMediaStore(store.db);
const newsLabStore = new NewsLabStore(store.db);
let stop = false;
process.on("SIGTERM", () => (stop = true));
process.on("SIGINT", () => (stop = true));
// Lint deterministik + penilaian makna oleh Codex. Struktur yang belum valid
// dilaporkan sebagai temuan revisi, bukan menggagalkan job.
async function review(
  article: string,
  c: Chapter,
  work: string,
  draft = false,
) {
  const lint = editorLint(article, draft);
  if (!lint.structure.ok)
    return {
      lolos: false,
      checks: [
        {
          id: "struktur",
          status: "revisi",
          catatan: lint.structure.errors.join("; "),
        },
      ],
      lint,
      provider: "lint",
      reviewedAt: new Date().toISOString(),
    };
  const report = editorReport(
    JSON.parse(
      await codex(
        articleReviewPrompt(c, article, reviewChecks, lint.findings),
        work,
      ),
    ),
  );
  if (!lint.ok) report.lolos = false;
  const full = {
    ...report,
    lint,
    provider: "codex-cli",
    reviewedAt: new Date().toISOString(),
  };
  writeFileSync(
    path.join(work, "editor_report.json"),
    JSON.stringify(full, null, 2),
  );
  return full;
}
// Revisi sesuai temuan editor dengan aturan artikel yang sama.
async function revise(article: string, report: any, c: Chapter, work: string) {
  writeFileSync(path.join(work, "article.pre-edit.md"), article);
  return codex(
    articleRevisePrompt(c, article, {
      checks: report.checks,
      lint: report.lint?.findings,
      struktur: report.lint?.structure?.errors,
    }),
    work,
  );
}

// Panel JPEG (format yang diterima Instagram); 4:4:4 agar teks tetap tajam.
const PANEL_JPEG = { quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" };
// Perbaiki format saja (struktur H1/H2, lima paragraf, atribusi, tag);
// isi kalimat tidak diubah.
async function fixFormat(
  article: string,
  errors: string[],
  c: Chapter,
  work: string,
) {
  writeFileSync(path.join(work, "article.pre-format.md"), article);
  return codex(articleFormatPrompt(c, article, errors), work);
}
// Gambar baru masuk kolam output/stock/<jenis>/<deskripsi>.jpg, tanpa id bab.
// Status posting dipantau terus sampai NC-WA menyatakan published/failed/unknown.
let lastPostPoll = 0;
async function pollPosts() {
  if (Date.now() - lastPostPoll < 15000) return;
  lastPostPoll = Date.now();
  try {
    await pollNewsPublications(newsMediaStore);
  } catch (e) {
    if ((e as { code?: string }).code !== "ER_NO_SUCH_TABLE")
      console.error("Status Instagram berita:", (e as Error).message);
  }
  for (const c of await store.pendingReels()) {
    try {
      const r = await postStatus(c.reels_request_id!);
      await store.setReels(c.id, {
        status: String(r.status),
        requestId: c.reels_request_id!,
        mediaId: r.mediaId,
      });
    } catch {}
  }
  for (const c of await store.pendingPosts()) {
    try {
      const r = await postStatus(c.post_request_id!);
      await store.setPost(c.id, {
        status: String(r.status),
        requestId: c.post_request_id!,
        mediaId: r.mediaId,
      });
    } catch {}
  }
}
// Panel disalin ke output/public dengan nama tetap per hasil render, sehingga
// permintaan ulang memakai URL yang sama (idempoten di NC-WA).
async function publicPanels(c: Chapter) {
  const m = JSON.parse(c.panels!);
  const origin = process.env.PUBLIC_ORIGIN || "https://ncpost.nuscode.id";
  const dir = path.join(ROOT, "output/public");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return Promise.all(
    [...m.panels.map((p: any) => p.file), m.closing]
      .filter(Boolean)
      .map(async (file: string) => {
        const name =
          createHash("sha256")
            .update(`${c.id}:${m.renderedAt}:${file}`)
            .digest("hex")
            .slice(0, 32) + ".jpg";
        await sharp(resolveMedia(file, panelDir(c)))
          .jpeg({ quality: 90 })
          .toFile(path.join(dir, name));
        return `${origin}/pub/${name}`;
      }),
  );
}
// Video versi upload disalin ke output/public dengan nama tetap per render.
function publicVideo(c: Chapter) {
  const m = JSON.parse(c.sentence_video!);
  const origin = process.env.PUBLIC_ORIGIN || "https://ncpost.nuscode.id";
  const dir = path.join(ROOT, "output/public");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const name =
    createHash("sha256")
      .update(`${c.id}:${m.renderedAt}:${m.file}`)
      .digest("hex")
      .slice(0, 32) + ".mp4";
  copyFileSync(resolveMedia(m.file, chapterDir(c)), path.join(dir, name));
  return `${origin}/pub/${name}`;
}
// Jenis proses untuk balon di kantor; klien memetakannya ke karyawan.
const liveKind = (table: string, job: { kind?: string }) =>
  table === "news_articles"
    ? "ARTICLE"
    : table === "lab_runs"
      ? `LAB_${String(job.kind).toUpperCase()}`
      : String(job.kind);
function generation(
  table: string,
  job: { id: number; cancel_version?: number; kind?: string },
  run: () => Promise<void>,
) {
  return withLive(`${table}:${job.id}`, liveKind(table, job), () => {
    live("Memulai…");
    return cancellableGeneration(
      store.db,
      table,
      job.id,
      run,
      Number(job.cancel_version || 0),
    );
  });
}
async function runJob(job: Job) {
  const startedAt = Date.now(),
    started = performance.now();
  let timing = timingStage(job.kind);
  const heartbeat = setInterval(
    () => store.heartbeat(job.id).catch(() => {}),
    60000,
  );
  try {
    const c = (await store.chapter(job.chapter_id))!;
    const work = path.join(ROOT, "output/work", String(job.id));
    mkdirSync(work, { recursive: true, mode: 0o700 });
    const mediaSettings = await store.bookSettings(
      c.book,
      store.db,
      c.content_type_id ?? 1,
    );
    const labFor = async (
      target: string,
      text = "",
      quote = "",
      variables: Record<string, string> = {},
    ) =>
      productionLabPrompt(
        store.db,
        await store.bookSettings(c.book, store.db, c.content_type_id ?? 1),
        target,
        {
          ...(c.article
            ? imageVariables(
                c.article,
                mediaSettings.imageUnit || "paragraph",
                0,
                c.content_engine === "quote",
                c.book,
                c.title,
              )
            : {}),
          buku: JSON.stringify(c.book),
          bab: JSON.stringify(c.title),
          teks: text,
          artikel: c.article
            ? imageVariables(
                c.article,
                "article",
                0,
                c.content_engine === "quote",
              ).artikel
            : "",
          quote: quote || text,
          ...variables,
        },
      );
    if (job.kind === "ARTICLE" && c.article_config) {
      const generated = await generateConfiguredArticle(
        store.db,
        await store.bookSettings(c.book, store.db, c.content_type_id ?? 1),
        c.content_engine || "book",
        work,
        c.book,
        c.title,
        undefined,
        c.content_type_id ?? 1,
      );
      writeFileSync(path.join(work, "prompt.md"), generated.prompt, {
        mode: 0o600,
      });
      await store.complete(job.id, {
        article: generated.article,
        report: JSON.stringify({ lolos: true, format: "configured" }),
      });
    } else if (job.kind === "ARTICLE" && c.content_engine === "quote") {
      const text = await generateStandaloneQuote(
        store.db,
        await store.bookSettings(c.book, store.db, c.content_type_id ?? 1),
        work,
        codex,
      );
      await store.complete(job.id, {
        article: text,
        report: JSON.stringify({ lolos: true, format: "quote" }),
      });
    } else if (job.kind === "PREVIEW") {
      const v = validateContentText(
        c.article,
        c.content_engine,
        c.article_config,
      );
      if (!v.ok) throw Error(v.errors.join("; "));
      const files = [];
      const part = partNumber(await store.list(), c);
      const units = mediaUnits(
        c.article,
        mediaSettings.imageUnit || "paragraph",
        c.content_engine === "quote",
      );
      for (let i = 0; i < units.length; i++) {
        const name = `panel-${i + 1}.jpg`;
        writeFileSync(
          path.join(work, name),
          await sharp(
            await renderPanel(
              "1",
              i + 1,
              i === 0 ? v.heading : "",
              units[i].text,
              `${c.book} - Bagian ${part}`,
            ),
          )
            .jpeg(PANEL_JPEG)
            .toBuffer(),
        );
        files.push(`work/${job.id}/${name}`);
      }
      await store.complete(job.id, {
        preview: JSON.stringify({
          mode: "template-only",
          seed: job.id,
          templates: Array(units.length).fill("1"),
          files,
          cta: "/api/cta",
          final: false,
        }),
      });
    } else if (job.kind === "QUOTE") {
      // Prompt = instruksi + seluruh paragraf artikel final; output apa adanya.
      const v = validateContentText(
        c.article,
        c.content_engine,
        c.article_config,
      );
      if (!v.ok) throw Error("Quote butuh artikel final yang valid");
      const lab = await labFor("QUOTE", v.paragraphs.join("\n\n"));
      const quote = quoteText(
        await codex(
          quoteInstruction(lab?.prompt || quotePrompt(v.paragraphs)),
          work,
        ),
      );
      await store.complete(job.id, { quote: quote.trim() });
    } else if (job.kind === "TTS_KALIMAT") {
      // Satu audio eleven_v3 per kalimat (teks kalimat saja, dibersihkan
      // seperti narasi panel).
      if (c.article_status !== "siap")
        throw Error("Audio kalimat butuh artikel lolos editor");
      const voice = await resolveVoice(
        store.db,
        mediaSettings.audioVoiceId,
        "elevenlabs",
      );
      const dir = audioDir(c);
      const sentences = [];
      // Kalimat 1 (paragraf hook) didahului heading hook, seperti panel 1.
      const { heading } = validateContentText(
        c.article,
        c.content_engine,
        c.article_config,
      );
      for (const [i, s] of mediaUnits(
        c.article,
        mediaSettings.imageUnit || "sentence",
        c.content_engine === "quote",
      ).entries()) {
        const text = ttsNarration(heading, s.text, i === 0);
        let alignment: unknown = null;
        const source = await sharedMedia({
          category: "audio",
          identity: [voice.provider, voice.voice_id],
          text,
          prompt: JSON.stringify(voiceRecipe(voice)),
          force: !!job.force_new,
          generate: async (temporary) => {
            alignment = await generateTimedVoiceAudio(voice, text, temporary);
          },
          details: () => (alignment ? { alignment } : undefined),
        });
        const file = path.relative(ROOT, source);
        sentences.push({
          sentence: i + 1,
          paragraph: s.paragraph,
          narration_text: text,
          file,
        });
      }
      await store.complete(job.id, {
        sentenceAudio: JSON.stringify({
          provider: voice.provider,
          ...voiceRecipe(voice),
          voice: voice.voice_id,
          sentences,
          renderedAt: new Date().toISOString(),
        }),
      });
    } else if (job.kind === "VIDEO_KALIMAT" || job.kind === "VIDEO_KALIMAT_H") {
      // Template subtitle D (slide pertama E2): vertikal 1080×1920 atau
      // horizontal 1920×1080. Audio per kalimat yang sama; lalu CTA,
      // visualizer, versi upload.
      const horizontal = job.kind === "VIDEO_KALIMAT_H";
      const spec = horizontal ? SUBTITLE_LANDSCAPE : SUBTITLE_VERTICAL;
      const settings = await store.bookSettings(
        c.book,
        store.db,
        c.content_type_id ?? 1,
      );
      if (isAnimation(settings, horizontal)) {
        // Video Animasi 2D: narasi = audio kolom Audio (teks artikel apa
        // adanya); Codex hanya menyusun adegan dan ilustrasinya.
        const v = validateContentText(
          c.article,
          c.content_engine,
          c.article_config,
        );
        if (c.article_status !== "siap" || !v.ok)
          throw Error("Video animasi 2D butuh artikel lolos editor");
        if (!c.sentence_audio)
          throw Error("Video animasi 2D butuh audio per kalimat");
        const audio = JSON.parse(c.sentence_audio);
        const units = mediaUnits(
          c.article,
          mediaSettings.imageUnit || "sentence",
          c.content_engine === "quote",
        );
        if (audio.sentences.length !== units.length)
          throw Error(
            "Audio kalimat tidak sesuai artikel; buat ulang audionya",
          );
        const files = audio.sentences.map((s: any) =>
          resolveMedia(s.file, audioDir(c)),
        );
        const result = await sharedVideo({
          preset: ANIMATION_PRESET,
          horizontal,
          text: units.map((u) => u.text).join("\n\n"),
          recipe: {
            mode: "anim2d",
            format: horizontal ? LANDSCAPE : VERTICAL,
          },
          sources: files,
          force: !!job.force_new,
          generate: (temporary) =>
            buildAnimationVideo(
              {
                title: stripMarkdownEmphasis(v.title || c.title),
                units: audio.sentences.map((s: any, i: number) => ({
                  text: s.narration_text,
                  file: files[i],
                })),
                horizontal,
                work,
                force: !!job.force_new,
                ask: (prompt) => codex(prompt, work),
              },
              temporary,
            ),
        });
        const manifest = JSON.stringify({
          ...result,
          source: ANIMATION_PRESET,
          renderedAt: new Date().toISOString(),
        });
        await store.complete(
          job.id,
          horizontal
            ? { sentenceVideoH: manifest }
            : { sentenceVideo: manifest },
        );
        return;
      }
      const sentenceVideoKind = horizontal
        ? settings.sentenceVideoHKind
        : settings.sentenceVideoKind;
      if (!sentenceVideoKind)
        throw Error(
          `Pilih sumber gambar Video Kalimat${horizontal ? " H" : ""} di Pengaturan Konten`,
        );
      if (!c.sentence_audio)
        throw Error("Video kalimat butuh audio per kalimat");
      const sentences = mediaUnits(
        c.article,
        mediaSettings.imageUnit || "sentence",
        c.content_engine === "quote",
      );
      const hookHeading = validateContentText(
        c.article,
        c.content_engine,
        c.article_config,
      ).heading;
      const audio = JSON.parse(c.sentence_audio);
      if (audio.sentences.length !== sentences.length)
        throw Error("Audio kalimat tidak sesuai artikel; buat ulang audionya");
      const stock = await store.stock(c.id, sentenceJob(sentenceVideoKind));
      const direct =
        (horizontal
          ? settings.sentenceVideoHMode
          : settings.sentenceVideoMode) === "direct";
      const videoLab = await labFor(
        sentenceVideoKind,
        sentences.map((s) => s.text).join("\n\n"),
      );
      if (direct) {
        const slides = sentences.map((_, i) => {
          const binding = stock.find((b) => b.panel === i + 1);
          if (!binding) throw Error(`Gambar kalimat ${i + 1} belum ada`);
          return {
            image: path.join(ROOT, binding.file),
            audio: resolveMedia(audio.sentences[i].file, audioDir(c)),
          };
        });
        const result = await sharedVideo({
          preset: videoLab?.name || sentenceVideoKind,
          presetId: videoLab?.id,
          horizontal,
          text: sentences.map((s) => s.text).join("\n\n"),
          recipe: {
            mode: "image_audio",
            format: horizontal ? LANDSCAPE : VERTICAL,
          },
          sources: slides.flatMap((s) => [s.image, s.audio]),
          force: !!job.force_new,
          generate: (temporary) =>
            buildImageAudioVideo(
              slides,
              temporary,
              work,
              horizontal ? LANDSCAPE : VERTICAL,
            ),
        });
        const manifest = JSON.stringify({
          ...result,
          source: sentenceVideoKind,
          renderedAt: new Date().toISOString(),
        });
        await store.complete(
          job.id,
          horizontal
            ? { sentenceVideoH: manifest }
            : { sentenceVideo: manifest },
        );
        return;
      }
      const panels: Parameters<typeof buildReels>[0] = [];
      for (const [i, s] of sentences.entries()) {
        const binding = stock.find((b) => b.panel === i + 1);
        if (!binding) throw Error(`Gambar kalimat ${i + 1} belum ada`);
        const image = path.join(work, `kalimat-${i + 1}.jpg`);
        const layout = subtitleLayout(s.text, spec);
        writeFileSync(
          image,
          await renderSubtitleFrame(
            path.join(ROOT, binding.file),
            layout,
            i === 0
              ? { heading: stripMarkdownEmphasis(hookHeading), label: "" }
              : undefined,
            spec,
          ),
        );
        panels.push({
          image,
          audio: resolveMedia(audio.sentences[i].file, audioDir(c)),
          layout,
          // Karaoke kalimat 1 menunggu heading hook selesai dibacakan.
          heading: i === 0 ? stripMarkdownEmphasis(hookHeading) : "",
          paragraph: s.text,
        });
      }
      const result = await sharedVideo({
        preset: videoLab?.name || sentenceVideoKind,
        presetId: videoLab?.id,
        horizontal,
        text: sentences.map((s) => s.text).join("\n\n"),
        recipe: {
          mode: "template",
          format: horizontal ? LANDSCAPE : VERTICAL,
          heading: hookHeading,
          label: "",
        },
        sources: [
          ...stock.map((s) => path.join(ROOT, s.file)),
          ...panels.map((p) => p.audio),
        ],
        force: !!job.force_new,
        generate: (temporary) =>
          buildReels(
            panels,
            temporary,
            work,
            horizontal ? LANDSCAPE : VERTICAL,
            path.join(ROOT, "output/cache/timeline", String(c.id), "kalimat"),
          ),
      });
      const manifest = JSON.stringify({
        ...result,
        source: sentenceVideoKind,
        renderedAt: new Date().toISOString(),
      });
      await store.complete(
        job.id,
        horizontal ? { sentenceVideoH: manifest } : { sentenceVideo: manifest },
      );
    } else if (job.kind === "POST_IMAGE") {
      if (
        c.article_status !== "siap" ||
        !validateContentText(c.article, c.content_engine, c.article_config).ok
      )
        throw Error("Gambar per seluruh teks butuh artikel lolos editor");
      const settings = await store.bookSettings(
        c.book,
        store.db,
        c.content_type_id ?? 1,
      );
      const style = settings.wholeTextImageKind || "IMAGE_HORIZONTAL";
      const lab = await wholeTextProductionPrompt(
        store.db,
        settings,
        imageVariables(
          c.article,
          "article",
          0,
          c.content_engine === "quote",
          c.book,
          c.title,
        ),
      );
      const postingOptions = {
        file: path.join(
          chapterDir(c),
          `gambar-teks-r${job.revision}-j${job.id}.jpg`,
        ),
        work,
        title:
          c.content_engine === "quote"
            ? ""
            : validateContentText(c.article, c.content_engine, c.article_config)
                .heading,
        text: validateContentText(
          c.article,
          c.content_engine,
          c.article_config,
        ).paragraphs.join("\n\n"),
        footer:
          c.content_engine === "quote"
            ? ""
            : `${c.book} · Bagian ${partNumber(await store.list(), c)}`,
        kind: style,
        force: !!job.force_new,
        lab,
      };
      const image =
        settings.singleImageMode === "template"
          ? await generateTemplatePost(postingOptions)
          : settings.singleImageMode === "direct"
            ? await generateReadyPost({
                ...postingOptions,
                lab,
              })
            : await generateWholeTextImage(
                c,
                c.article,
                work,
                job.revision,
                job.id,
                generateCodexImage,
                await wholeTextProductionPrompt(
                  store.db,
                  await store.bookSettings(
                    c.book,
                    store.db,
                    c.content_type_id ?? 1,
                  ),
                  {
                    teks: c.article,
                    artikel: c.article
                      ? imageVariables(
                          c.article,
                          "article",
                          0,
                          c.content_engine === "quote",
                        ).artikel
                      : "",
                    bab: c.title,
                    buku: c.book,
                    quote: "",
                  },
                ),
                !!job.force_new,
              );
      await store.complete(job.id, {
        textImage: JSON.stringify({
          ...image,
          file: path.relative(ROOT, image.file),
        }),
      });
    } else if (job.kind === "QUOTE_IMAGE") {
      // Gaya mengikuti Pengaturan Konten; orientasi bebas (ukuran asli Codex).
      if (!c.quote) throw Error("Gambar quote butuh quote");
      const { quoteImageStyle } = await store.bookSettings(
        c.book,
        store.db,
        c.content_type_id ?? 1,
      );
      const lab = labImageKind(quoteImageStyle)
        ? await labFor(quoteImageStyle, c.quote, c.quote)
        : null;
      const prompt = lab?.prompt || quoteImagePrompt(quoteImageStyle, c.quote);
      const file = await sharedMedia({
        category: "image",
        identity: [lab?.name || quoteImageStyle, "bebas"],
        text: c.quote,
        presetId: lab?.id,
        prompt,
        force: !!job.force_new,
        generate: (temporary) =>
          generateCodexImage(
            prompt,
            work,
            temporary,
            "bebas",
            ...(lab ? ([lab.images] as [string[]]) : []),
          ),
      });
      await store.complete(job.id, {
        quoteImage: JSON.stringify({
          style: quoteImageStyle,
          file: path.relative(ROOT, file),
          prompt,
          renderedAt: new Date().toISOString(),
        }),
      });
    } else if (job.kind === "POST_IG") {
      if (c.panel_status !== "tersedia" || !c.panels)
        throw Error("Post IG butuh panel yang sudah dirender");
      const bookSettings = await store.bookSettings(
        c.book,
        store.db,
        c.content_type_id ?? 1,
      );
      const igUserId = selectInstagramAccount(
        bookSettings.instagramAccountId,
        await accounts(),
      ).id;
      // Percobaan setelah gagal memakai requestId baru; selain itu ID lama dipakai ulang.
      const requestId = job.force_new
        ? `ncpost-${c.id}-repost-j${job.id}`
        : c.post_request_id && c.post_status !== "failed"
          ? c.post_request_id
          : `ncpost-${c.id}-${Date.now().toString(36)}`;
      const payload = {
        requestId,
        igUserId,
        imageUrls: await publicPanels(c),
        caption: instagramCaption(c.article, c.article_config),
      };
      await sendInstagramPublication(store, c.id, "POST_IG", requestId, () =>
        publishCarousel(payload),
      );
      await store.complete(job.id, {});
    } else if (job.kind === "REELS_IG") {
      if (!c.sentence_video)
        throw Error("Reels IG butuh Video yang sudah dirender");
      const bookSettings = await store.bookSettings(
        c.book,
        store.db,
        c.content_type_id ?? 1,
      );
      const igUserId = selectInstagramAccount(
        bookSettings.instagramAccountId,
        await accounts(),
      ).id;
      const requestId = job.force_new
        ? `ncpost-reels-${c.id}-repost-j${job.id}`
        : c.reels_request_id && c.reels_status !== "failed"
          ? c.reels_request_id
          : `ncpost-reels-${c.id}-${Date.now().toString(36)}`;
      const payload = {
        requestId,
        igUserId,
        videoUrl: publicVideo(c),
        caption: instagramCaption(c.article, c.article_config),
      };
      await sendInstagramPublication(store, c.id, "REELS_IG", requestId, () =>
        publish(payload),
      );
      await store.complete(job.id, {});
    } else if (job.kind === "PANEL") {
      // Port render_panels_5panel.py: 5 panel + slide penutup, 1080×1350.
      if (c.article_status !== "siap")
        throw Error("Artikel belum lolos editor");
      const v = validateContentText(
        c.article,
        c.content_engine,
        c.article_config,
      );
      // Sumber gambar panel mengikuti Pengaturan Konten buku ini.
      const settings = await store.bookSettings(
        c.book,
        store.db,
        c.content_type_id ?? 1,
      );
      if (settings.carouselMode === "direct") {
        timing = "images";
        const dir = panelDir(c);
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        const manifest = await generateDirectCarousel({
          dir,
          work,
          force: !!job.force_new,
          title: stripMarkdownEmphasis(v.heading),
          paragraphs: mediaUnits(
            c.article,
            settings.imageUnit || "paragraph",
            c.content_engine === "quote",
          ).map((entry) => stripMarkdownEmphasis(entry.text)),
          variables: (index) =>
            imageVariables(
              c.article,
              settings.imageUnit || "paragraph",
              index,
              c.content_engine === "quote",
              c.book,
              c.title,
            ),
          footer: `${c.book} - Bagian ${partNumber(await store.list(), c)}`,
          kind: settings.panelVertical || settings.panelHorizontal!,
          labFor,
        });
        await store.complete(job.id, {
          panels: JSON.stringify({
            ...manifest,
            panels: manifest.panels.map((p) => ({
              ...p,
              file: path.relative(ROOT, p.file),
            })),
            closing: manifest.closing
              ? path.relative(ROOT, manifest.closing)
              : null,
          }),
        });
        return;
      }
      const horizontal = settings.panelHorizontal
        ? await store.stock(c.id, settings.panelHorizontal)
        : [];
      const vertical = settings.panelVertical
        ? await store.stock(c.id, settings.panelVertical)
        : [];
      for (const [source, list] of [
        [settings.panelHorizontal, horizontal],
        [settings.panelVertical, vertical],
      ] as const)
        if (
          source &&
          list.length <
            mediaUnits(
              c.article,
              settings.imageUnit || "paragraph",
              c.content_engine === "quote",
            ).length
        )
          throw Error("Render panel butuh stok untuk setiap unit: " + source);
      const part = partNumber(await store.list(), c);
      const footer = `${c.book} - Bagian ${part}`;
      const dir = panelDir(c);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const panels = [];
      for (
        let i = 0;
        i <
        mediaUnits(
          c.article,
          settings.imageUnit || "paragraph",
          c.content_engine === "quote",
        ).length;
        i++
      ) {
        // Heading panel 1 = judul bagian (input pengguna), bukan judul artikel.
        const heading = i === 0 ? stripMarkdownEmphasis(v.heading) : "";
        const body = stripMarkdownEmphasis(
          mediaUnits(
            c.article,
            settings.imageUnit || "paragraph",
            c.content_engine === "quote",
          )[i].text,
        );
        const portrait = vertical.find((b) => b.panel === i + 1);
        const t = pickTemplate(
          heading,
          body,
          !!portrait,
          !!settings.panelHorizontal,
        );
        const stock = t.vertical
          ? portrait!
          : horizontal.find((b) => b.panel === i + 1)!;
        const name = `0${i + 1}-panel.jpg`;
        writeFileSync(
          path.join(dir, name),
          await sharp(
            await renderPanel(
              t.id,
              i + 1,
              heading,
              body,
              footer,
              path.join(ROOT, stock.file),
            ),
          )
            .jpeg(PANEL_JPEG)
            .toBuffer(),
        );
        panels.push({ file: name, template: t.id, asset_id: stock.asset_id });
      }
      const closing = path.join(
        SOURCE,
        "asset/closing-slide/slide-penutup-final.png",
      );
      const meta = await sharp(closing).metadata();
      if (meta.width !== 1080 || meta.height !== 1350)
        throw Error("Slide penutup bukan 1080×1350");
      const closingFile = `${String(panels.length + 1).padStart(2, "0")}-slide-penutup.jpg`;
      await sharp(closing).jpeg(PANEL_JPEG).toFile(path.join(dir, closingFile));
      await store.complete(job.id, {
        panels: JSON.stringify({
          footer,
          panels,
          closing: closingFile,
          renderedAt: new Date().toISOString(),
        }),
      });
    } else if (job.kind.startsWith("S_IMAGE_")) {
      // Gambar per kalimat: kolam dan prompt lajur yang sama; deskripsi dan
      // teks prompt = kalimatnya. Ikatan disimpan per nomor kalimat.
      if (c.article_status !== "siap")
        throw Error("Artikel belum lolos editor");
      const kind = baseKind(job.kind);
      const v = validateContentText(
        c.article,
        c.content_engine,
        c.article_config,
      );
      const sentences = mediaUnits(
        c.article,
        mediaSettings.imageUnit || "sentence",
        c.content_engine === "quote",
      );
      let bound = true;
      for (let i = 0; i < sentences.length && bound; i++) {
        const taken = await store.stock(c.id, job.kind);
        if (taken.some((b) => b.panel === i + 1)) continue;
        const sentence = sentences[i].text;
        const lab = await labFor(
          kind,
          sentence,
          "",
          imageVariables(
            c.article,
            mediaSettings.imageUnit || "sentence",
            i,
            c.content_engine === "quote",
            c.book,
            c.title,
          ),
        );
        const assetId = await generateStock(
          store,
          kind,
          sentence,
          "",
          work,
          i + 1,
          lab,
          !!job.force_new,
        );
        bound = await store.bind(job.id, i + 1, assetId);
      }
      await store.complete(job.id, {});
    } else if (job.kind.startsWith("IMAGE_")) {
      if (c.article_status !== "siap")
        throw Error("Artikel belum lolos editor");
      const v = validateContentText(
        c.article,
        c.content_engine,
        c.article_config,
      );
      let bound = true;
      for (
        let i = 0;
        i <
          mediaUnits(
            c.article,
            mediaSettings.imageUnit || "paragraph",
            c.content_engine === "quote",
          ).length && bound;
        i++
      ) {
        const taken = await store.stock(c.id, job.kind);
        if (taken.some((b) => b.panel === i + 1)) continue;
        const heading = v.heading;
        const paragraph = stripMarkdownEmphasis(
          mediaUnits(
            c.article,
            mediaSettings.imageUnit || "paragraph",
            c.content_engine === "quote",
          )[i].text,
        );
        const lab = await labFor(
          job.kind,
          `${heading} — ${paragraph}`,
          "",
          imageVariables(
            c.article,
            mediaSettings.imageUnit || "paragraph",
            i,
            c.content_engine === "quote",
            c.book,
            c.title,
          ),
        );
        const assetId = await generateStock(
          store,
          job.kind,
          heading,
          paragraph,
          work,
          i + 1,
          lab,
          !!job.force_new,
        );
        bound = await store.bind(job.id, i + 1, assetId);
      }
      // Bila revisi berubah, complete() membatalkan job; aset tetap di kolam.
      await store.complete(
        job.id,
        bound ? { visual: "tersedia: " + job.kind } : {},
      );
    } else if (job.kind === "ARTICLE") {
      // Tulis → review → terapkan review → review format → hook → gabung.
      const lab = await labFor("book");
      const prompt = lab?.prompt || articleWritePrompt(c);
      writeFileSync(path.join(work, "prompt.md"), prompt, { mode: 0o600 });
      let article = await codex(prompt, work);
      const report = await review(article, c, work, true);
      const applied = !report.lolos;
      const before = article;
      if (applied) article = await revise(article, report, c, work);
      // Review khusus format (sekali): revisi bisa merusak struktur artikel.
      const format = validateDraft(article);
      let formatFixed = false;
      if (!format.ok) {
        article = await fixFormat(article, format.errors, c, work);
        const recheck = validateDraft(article);
        if (!recheck.ok)
          throw Error(
            "Format artikel tetap rusak: " + recheck.errors.join("; "),
          );
        formatFixed = true;
      }
      writeFileSync(path.join(work, "article.draft.md"), article);
      // Tahap akhir: hook dari kelima paragraf, lalu menjadi paragraf
      // pertama di bawah heading hook.
      const hookOutput = await codex(
        hookPrompt(validateDraft(article).paragraphs),
        work,
      );
      writeFileSync(path.join(work, "hook.md"), hookOutput);
      article = mergeHook(article, parseHook(hookOutput));
      const final = validateArticle(article);
      if (!final.ok)
        throw Error("Artikel final tidak valid: " + final.errors.join("; "));
      writeFileSync(path.join(work, "article.md"), article);
      await store.complete(job.id, {
        article,
        report: JSON.stringify({
          ...report,
          lolos: true,
          applied,
          formatFixed,
          ...(applied ? { before } : {}),
        }),
      });
    } else {
      const full = await review(c.article, c, work);
      await store.complete(job.id, { report: JSON.stringify(full) });
    }
  } catch (e) {
    await store.fail(job.id, e instanceof Error ? e.message : "Worker gagal");
  } finally {
    clearInterval(heartbeat);
    await finishProcessTiming(
      store.db,
      "book",
      job,
      timing,
      startedAt,
      performance.now() - started,
    );
  }
}
// Hingga WORKER_CONCURRENCY job (bawaan dan maksimal 2) berjalan bersamaan; urutan dan
// ketergantungan per bagian dijaga oleh store.claim (canStart).
const CONCURRENCY = workerConcurrency(process.env.WORKER_CONCURRENCY);
const running = new Set<Promise<void>>();
// Posting Instagram punya lajur sendiri di luar WORKER_CONCURRENCY: job singkat
// ini tidak boleh antre di belakang produksi panjang (mis. render video).
const POST_JOBS = ["POST_IG", "REELS_IG"];
let posting: Promise<void> | null = null;
let lastCronMinute = -1;
let lastManagerMinute = -1;
let lastStatsHour = -1;
let newsRunning = false;
// Tes Lab Berita punya lajur sendiri, dicek tiap menit.
let jurnalis: Promise<void> | null = null;
let lastJurnalisMinute = -1;
// Error tak terduga (job, atau DB seperti deadlock) cukup dicatat; worker
// tetap hidup dan mencoba lagi di putaran berikutnya.
const logJobError = (e: unknown) =>
  console.error("Job gagal:", (e as Error)?.message ?? e);
while (!stop) {
  try {
    if (existsSync(path.join(ROOT, "data/media-reset.guard"))) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    await store.recover();
    await pollPosts();
    const minute = Math.floor(Date.now() / 60000);
    if (minute !== lastCronMinute) {
      try {
        await store.scheduleCrons(Date.now(), (source, platform) =>
          publishZernio(store, {
            quickTikTok: platform !== "youtube",
            quickYouTube: platform === "youtube",
            source,
          }),
        );
        await new NewsCronStore(store.db, undefined, (source, platform) =>
          publishZernio(store, {
            quickTikTok: platform !== "youtube",
            quickYouTube: platform === "youtube",
            source,
          }),
        ).schedule();
        lastCronMinute = minute;
      } catch (e) {
        console.error("Cron gagal:", (e as Error).message);
        // Retry next minute; queue processing remains available.
        lastCronMinute = minute;
      }
    }
    // Statistik akun: data hari ini diperbarui tiap jam (nilai terakhir hari itu yang tersimpan).
    const hour = Math.floor(Date.now() / 3600000);
    if (hour !== lastStatsHour) {
      lastStatsHour = hour;
      try {
        const r = await snapshotInstagram(store.db, {
          accounts,
          summary: (id) => instagramSummary(id),
        });
        if (r.errors.length)
          console.error("Statistik akun:", r.errors.join("; "));
      } catch (e) {
        console.error("Statistik akun gagal:", (e as Error).message);
      }
    }
    if (minute !== lastManagerMinute) {
      lastManagerMinute = minute;
      // Manajer: target posting harian per jenis konten (terpisah dari jadwal manual).
      try {
        await managerTick(store, (source, platform) =>
          publishZernio(store, {
            quickTikTok: platform !== "youtube",
            quickYouTube: platform === "youtube",
            source,
          }),
        );
      } catch (e) {
        console.error("Manajer gagal:", (e as Error).message);
      }
    }
    if (!jurnalis && minute !== lastJurnalisMinute) {
      lastJurnalisMinute = minute;
      try {
        // Jurnalis dipanggil produksi artikel; lajur ini hanya untuk Tes.
        const test = await newsLabStore.claimTest();
        if (test)
          jurnalis = withLive(`jurnalis-test:${test.id}`, "JURNALIS", () =>
            runJurnalisTest(newsLabStore, test),
          )
            .catch((e) =>
              console.error("Tes Jurnalis gagal:", (e as Error).message),
            )
            .finally(() => {
              jurnalis = null;
            });
      } catch (e) {
        if ((e as { code?: string }).code !== "ER_NO_SUCH_TABLE")
          console.error("Jurnalis gagal:", (e as Error).message);
      }
    }
    // At most one news research job per worker; book jobs share the remaining slots.
    if (running.size < CONCURRENCY && !newsRunning) {
      try {
        const news = await newsStore.claim();
        if (news) {
          newsRunning = true;
          const task: Promise<void> = generation("news_articles", news, () =>
            runNewsJob(newsStore, news),
          )
            .catch((e) =>
              console.error("Artikel berita gagal:", (e as Error).message),
            )
            .finally(() => {
              running.delete(task);
              newsRunning = false;
            });
          running.add(task);
        }
      } catch (e) {
        if ((e as { code?: string }).code !== "ER_NO_SUCH_TABLE")
          console.error("Antrean berita gagal:", (e as Error).message);
      }
    }
    while (running.size < CONCURRENCY) {
      try {
        const job = await newsMediaStore.claim();
        if (!job) break;
        const task: Promise<void> = generation("news_media_jobs", job, () =>
          runNewsMediaJob(newsMediaStore, store, job),
        )
          .catch(logJobError)
          .finally(() => running.delete(task));
        running.add(task);
      } catch (e) {
        if ((e as { code?: string }).code !== "ER_NO_SUCH_TABLE")
          console.error("Produksi berita gagal:", (e as Error).message);
        break;
      }
    }
    if (!posting) {
      const job = await store.claim(Date.now(), POST_JOBS);
      if (job)
        posting = generation("jobs", job, () => runJob(job))
          .catch(logJobError)
          .finally(() => {
            posting = null;
          });
    }
    while (running.size < CONCURRENCY) {
      const job = await store.claim();
      if (!job) break;
      const task: Promise<void> = generation("jobs", job, () => runJob(job))
        .catch(logJobError)
        .finally(() => running.delete(task));
      running.add(task);
    }
    if (running.size < CONCURRENCY) {
      try {
        const job = await labStore.claim();
        if (job) {
          const task: Promise<void> = generation("lab_runs", job, () =>
            runLabJob(labStore, job),
          )
            .catch(logJobError)
            .finally(() => running.delete(task));
          running.add(task);
        }
      } catch (e) {
        if ((e as { code?: string }).code !== "ER_NO_SUCH_TABLE")
          console.error("Lab gagal:", (e as Error).message);
      }
    }
    await Promise.race([
      new Promise((r) => setTimeout(r, 1000)),
      ...running,
      ...(posting ? [posting] : []),
      ...(jurnalis ? [jurnalis] : []),
    ]);
  } catch (e) {
    console.error("Putaran worker gagal:", (e as Error)?.message ?? e);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
await Promise.all([...running, posting, jurnalis]);
await store.close();
