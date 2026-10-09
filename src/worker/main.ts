import { generateWholeTextImage } from "./text-image";
import { LabStore } from "../server/lab";
import { runLabJob } from "./lab";
import { NewsCronStore } from "../server/news-cron";
import { NewsMediaStore } from "../server/news-media-store";
import { runNewsMediaJob, pollNewsPublications } from "./news-media";
import { generateStock } from "./stock-generator";
import { NewsStore } from "../server/news-store";
import { runNewsJob } from "./news";
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
  validateDraft,
  parseHook,
  mergeHook,
  articleSentences,
  PANEL_COUNT,
  partNumber,
  instagramCaption,
} from "../server/domain";
import {
  accounts,
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
import { baseKind, sentenceJob } from "../server/book-settings";
import { SOURCE } from "../server/templates";
import {
  audioDir,
  chapterDir,
  panelDir,
  quoteImagePath,
  videoPath,
} from "../server/output-paths";
import { panelHeading, stripMarkdownEmphasis } from "../server/stock-prompts";
import { bestAsset, panelTokens, tokenize } from "../server/stock-match";
initConfig();
const store = new Store();
const newsStore = new NewsStore(store.db);
const labStore = new LabStore(store.db);
const newsMediaStore = new NewsMediaStore(store.db);
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
const CLOSING_FILE = `0${PANEL_COUNT + 1}-slide-penutup.jpg`;
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
function publicPanels(c: Chapter) {
  const m = JSON.parse(c.panels!);
  const origin = process.env.PUBLIC_ORIGIN || "https://ncpost.nuscode.id";
  const dir = path.join(ROOT, "output/public");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return [...m.panels.map((p: any) => p.file), m.closing].map(
    (file: string) => {
      const name =
        createHash("sha256")
          .update(`${c.id}:${m.renderedAt}:${file}`)
          .digest("hex")
          .slice(0, 32) + ".jpg";
      copyFileSync(path.join(panelDir(c), file), path.join(dir, name));
      return `${origin}/pub/${name}`;
    },
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
  copyFileSync(path.join(chapterDir(c), m.file), path.join(dir, name));
  return `${origin}/pub/${name}`;
}
async function runJob(job: Job) {
  const heartbeat = setInterval(
    () => store.heartbeat(job.id).catch(() => {}),
    60000,
  );
  try {
    const c = (await store.chapter(job.chapter_id))!;
    const work = path.join(ROOT, "output/work", String(job.id));
    mkdirSync(work, { recursive: true, mode: 0o700 });
    if (job.kind === "PREVIEW") {
      const v = validateArticle(c.article);
      if (!v.ok) throw Error(v.errors.join("; "));
      const files = [];
      const part = partNumber(await store.list(), c);
      for (let i = 0; i < PANEL_COUNT; i++) {
        const name = `panel-${i + 1}.png`;
        writeFileSync(
          path.join(work, name),
          await renderPanel(
            "1",
            i + 1,
            i === 0 ? v.heading : "",
            v.paragraphs[i],
            `${c.book} - Bagian ${part}`,
          ),
        );
        files.push(`work/${job.id}/${name}`);
      }
      await store.complete(job.id, {
        preview: JSON.stringify({
          mode: "template-only",
          seed: job.id,
          templates: Array(5).fill("1"),
          files,
          cta: "/api/cta",
          final: false,
        }),
      });
    } else if (job.kind === "QUOTE") {
      // Prompt = instruksi + seluruh paragraf artikel final; output apa adanya.
      const v = validateArticle(c.article);
      if (!v.ok) throw Error("Quote butuh artikel final yang valid");
      const quote = await codex(quotePrompt(v.paragraphs), work);
      await store.complete(job.id, { quote: quote.trim() });
    } else if (job.kind === "TTS_KALIMAT") {
      // Satu audio eleven_v3 per kalimat (teks kalimat saja, dibersihkan
      // seperti narasi panel).
      if (c.article_status !== "siap")
        throw Error("Audio kalimat butuh artikel lolos editor");
      const config = {
        live: process.env.LIVE_TTS === "true",
        key: process.env.ELEVENLABS_API_KEY ?? "",
        voice: process.env.ELEVENLABS_VOICE_ID ?? "",
      };
      const dir = audioDir(c);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const sentences = [];
      // Kalimat 1 (paragraf hook) didahului heading hook, seperti panel 1.
      const { heading } = validateArticle(c.article);
      for (const [i, s] of articleSentences(c.article).entries()) {
        const text = ttsNarration(heading, s.text, i === 0);
        const file = `kalimat_${String(i + 1).padStart(2, "0")}.mp3`;
        writeFileSync(path.join(dir, file), await tts(text, config));
        sentences.push({
          sentence: i + 1,
          paragraph: s.paragraph,
          narration_text: text,
          file,
        });
      }
      await store.complete(job.id, {
        sentenceAudio: JSON.stringify({
          provider: "elevenlabs",
          model_id: "eleven_v3",
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
      const sentenceVideoKind = horizontal
        ? settings.sentenceVideoHKind
        : settings.sentenceVideoKind;
      if (!sentenceVideoKind)
        throw Error(
          `Pilih sumber gambar Video Kalimat${horizontal ? " H" : ""} di Pengaturan Konten`,
        );
      if (!c.sentence_audio)
        throw Error("Video kalimat butuh audio per kalimat");
      const sentences = articleSentences(c.article);
      const hookHeading = validateArticle(c.article).heading;
      const part = partNumber(await store.list(), c);
      const audio = JSON.parse(c.sentence_audio);
      if (audio.sentences.length !== sentences.length)
        throw Error("Audio kalimat tidak sesuai artikel; buat ulang audionya");
      const stock = await store.stock(c.id, sentenceJob(sentenceVideoKind));
      const panels = [];
      for (const [i, s] of sentences.entries()) {
        const binding = stock.find((b) => b.panel === i + 1);
        if (!binding) throw Error(`Gambar kalimat ${i + 1} belum ada`);
        const image = path.join(work, `kalimat-${i + 1}.png`);
        const layout = subtitleLayout(s.text, spec);
        writeFileSync(
          image,
          await renderSubtitleFrame(
            path.join(ROOT, binding.file),
            layout,
            // Slide pertama (template E2): heading hook ikut dibacakan.
            i === 0
              ? {
                  heading: stripMarkdownEmphasis(hookHeading),
                  label: `${c.book} · Bagian ${part}`,
                }
              : undefined,
            spec,
          ),
        );
        panels.push({
          image,
          audio: path.join(audioDir(c), audio.sentences[i].file),
          layout,
          // Karaoke kalimat 1 menunggu heading hook selesai dibacakan.
          heading: i === 0 ? stripMarkdownEmphasis(hookHeading) : "",
          paragraph: s.text,
        });
      }
      const outFile = videoPath(c, horizontal);
      rmSync(outFile, { force: true });
      mkdirSync(path.dirname(outFile), { recursive: true, mode: 0o700 });
      // Video vertikal dan horizontal memakai narasi dan jeda yang sama, jadi
      // audio dan visualizer-nya dibagi lewat cache timeline.
      let result;
      try {
        result = await buildReels(
          panels,
          outFile,
          work,
          horizontal ? LANDSCAPE : VERTICAL,
          path.join(ROOT, "output/cache/timeline", String(c.id), "kalimat"),
        );
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
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
      if (c.article_status !== "siap" || !validateArticle(c.article).ok)
        throw Error("Gambar per seluruh teks butuh artikel lolos editor");
      const image = await generateWholeTextImage(
        c,
        c.article,
        work,
        job.revision,
        job.id,
      );
      await store.complete(job.id, { textImage: JSON.stringify(image) });
    } else if (job.kind === "QUOTE_IMAGE") {
      // Gaya mengikuti Pengaturan Konten; orientasi bebas (ukuran asli Codex).
      if (!c.quote) throw Error("Gambar quote butuh quote");
      const { quoteImageStyle } = await store.bookSettings(
        c.book,
        store.db,
        c.content_type_id ?? 1,
      );
      const prompt = quoteImagePrompt(quoteImageStyle, c.quote);
      const file = quoteImagePath(c);
      mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      let failure = "";
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await generateCodexImage(prompt, work, file, "bebas");
          failure = "";
          break;
        } catch (e) {
          failure = (e as Error).message;
        }
      }
      if (failure)
        throw Error(`Gambar quote gagal setelah 3 percobaan: ${failure}`);
      await store.complete(job.id, {
        quoteImage: JSON.stringify({
          style: quoteImageStyle,
          file: "quote.jpg",
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
      const requestId =
        c.post_request_id && c.post_status !== "failed"
          ? c.post_request_id
          : `ncpost-${c.id}-${Date.now().toString(36)}`;
      const r = await publishCarousel({
        requestId,
        igUserId,
        imageUrls: publicPanels(c),
        caption: instagramCaption(c.article),
      });
      await store.setPost(c.id, {
        status: String(r.status),
        requestId,
        mediaId: r.mediaId,
      });
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
      const requestId =
        c.reels_request_id && c.reels_status !== "failed"
          ? c.reels_request_id
          : `ncpost-reels-${c.id}-${Date.now().toString(36)}`;
      const r = await publish({
        requestId,
        igUserId,
        videoUrl: publicVideo(c),
        caption: instagramCaption(c.article),
      });
      await store.setReels(c.id, {
        status: String(r.status),
        requestId,
        mediaId: r.mediaId,
      });
      await store.complete(job.id, {});
    } else if (job.kind === "PANEL") {
      // Port render_panels_5panel.py: 5 panel + slide penutup, 1080×1350.
      if (c.article_status !== "siap")
        throw Error("Artikel belum lolos editor");
      const v = validateArticle(c.article);
      // Sumber gambar panel mengikuti Pengaturan Konten buku ini.
      const settings = await store.bookSettings(
        c.book,
        store.db,
        c.content_type_id ?? 1,
      );
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
        if (source && list.length < PANEL_COUNT)
          throw Error("Render panel butuh lima stok gambar " + source);
      const part = partNumber(await store.list(), c);
      const footer = `${c.book} - Bagian ${part}`;
      const dir = panelDir(c);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const panels = [];
      for (let i = 0; i < PANEL_COUNT; i++) {
        // Heading panel 1 = judul bagian (input pengguna), bukan judul artikel.
        const heading = i === 0 ? stripMarkdownEmphasis(v.heading) : "";
        const body = stripMarkdownEmphasis(v.paragraphs[i]);
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
      await sharp(closing)
        .jpeg(PANEL_JPEG)
        .toFile(path.join(dir, CLOSING_FILE));
      await store.complete(job.id, {
        panels: JSON.stringify({
          footer,
          panels,
          closing: CLOSING_FILE,
          renderedAt: new Date().toISOString(),
        }),
      });
    } else if (job.kind.startsWith("S_IMAGE_")) {
      // Gambar per kalimat: kolam dan prompt lajur yang sama; deskripsi dan
      // teks prompt = kalimatnya. Ikatan disimpan per nomor kalimat.
      if (c.article_status !== "siap")
        throw Error("Artikel belum lolos editor");
      const kind = baseKind(job.kind);
      const v = validateArticle(c.article);
      const sentences = articleSentences(c.article);
      let bound = true;
      for (let i = 0; i < sentences.length && bound; i++) {
        const taken = await store.stock(c.id, job.kind);
        if (taken.some((b) => b.panel === i + 1)) continue;
        const sentence = sentences[i].text;
        const match = job.force_new
          ? undefined
          : bestAsset(
              tokenize([sentence, ...v.tags].join(" ")),
              await store.assets(kind),
              new Set(taken.map((b) => b.asset_id)),
            );
        const assetId =
          match?.asset.id ??
          (await generateStock(store, kind, sentence, "", work, i + 1));
        bound = await store.bind(job.id, i + 1, assetId);
      }
      await store.complete(job.id, {});
    } else if (job.kind.startsWith("IMAGE_")) {
      if (c.article_status !== "siap")
        throw Error("Artikel belum lolos editor");
      const v = validateArticle(c.article);
      let bound = true;
      for (let i = 0; i < PANEL_COUNT && bound; i++) {
        const taken = await store.stock(c.id, job.kind);
        if (taken.some((b) => b.panel === i + 1)) continue;
        const heading = panelHeading(v.heading, v.paragraphs[i], i);
        const paragraph = stripMarkdownEmphasis(v.paragraphs[i]);
        const match = job.force_new
          ? undefined
          : bestAsset(
              panelTokens(heading, paragraph, v.tags),
              await store.assets(job.kind),
              new Set(taken.map((b) => b.asset_id)),
            );
        const assetId =
          match?.asset.id ??
          (await generateStock(
            store,
            job.kind,
            heading,
            paragraph,
            work,
            i + 1,
          ));
        bound = await store.bind(job.id, i + 1, assetId);
      }
      // Bila revisi berubah, complete() membatalkan job; aset tetap di kolam.
      await store.complete(
        job.id,
        bound ? { visual: "tersedia: " + job.kind } : {},
      );
    } else if (job.kind === "ARTICLE") {
      // Tulis → review → terapkan review → review format → hook → gabung.
      let article = await codex(articleWritePrompt(c), work);
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
  }
}
// Hingga WORKER_CONCURRENCY job (bawaan 3) berjalan bersamaan; urutan dan
// ketergantungan per bagian dijaga oleh store.claim (canStart).
const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY) || 3);
const running = new Set<Promise<void>>();
let lastCronMinute = -1;
let newsRunning = false;
while (!stop) {
  await store.recover();
  await pollPosts();
  const minute = Math.floor(Date.now() / 60000);
  if (minute !== lastCronMinute) {
    try {
      await store.scheduleCrons();
      await new NewsCronStore(store.db).schedule();
      lastCronMinute = minute;
    } catch (e) {
      console.error("Cron gagal:", (e as Error).message);
      // Retry next minute; queue processing remains available.
      lastCronMinute = minute;
    }
  }
  // At most one news research job per worker; book jobs share the remaining slots.
  if (running.size < CONCURRENCY && !newsRunning) {
    try {
      const news = await newsStore.claim();
      if (news) {
        newsRunning = true;
        const task: Promise<void> = runNewsJob(newsStore, news)
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
      const task: Promise<void> = runNewsMediaJob(
        newsMediaStore,
        store,
        job,
      ).finally(() => running.delete(task));
      running.add(task);
    } catch (e) {
      if ((e as { code?: string }).code !== "ER_NO_SUCH_TABLE")
        console.error("Produksi berita gagal:", (e as Error).message);
      break;
    }
  }
  while (running.size < CONCURRENCY) {
    const job = await store.claim();
    if (!job) break;
    const task: Promise<void> = runJob(job).finally(() => running.delete(task));
    running.add(task);
  }
  if (running.size < CONCURRENCY) {
    try {
      const job = await labStore.claim();
      if (job) {
        const task = runLabJob(labStore, job).finally(() =>
          running.delete(task),
        );
        running.add(task);
      }
    } catch (e) {
      if ((e as { code?: string }).code !== "ER_NO_SUCH_TABLE")
        console.error("Lab gagal:", (e as Error).message);
    }
  }
  await Promise.race([new Promise((r) => setTimeout(r, 1000)), ...running]);
}
await Promise.all(running);
await store.close();
