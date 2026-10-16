import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { outputRoot } from "../server/output-paths";
import {
  acceptLinks,
  jurnalisPrompt,
  linkHash,
  type NewsLab,
  NewsLabStore,
} from "../server/news-lab";
import { newsSourceKey } from "../server/news";
import {
  configuredArticlePrompt,
  normalizeArticleConfig,
  validateUnifiedArticle,
} from "../server/content-contract";
import { citesLink, runConfiguredModel } from "./configured-article";

/** Ambil link dari jawaban model (JSON, boleh dibungkus blok kode). */
export function parseJurnalisLink(text: string): unknown {
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  if (!json) throw Error("Jurnalis tidak mengembalikan JSON");
  const link = JSON.parse(json).link;
  if (typeof link !== "string")
    throw Error("Jurnalis tidak mengembalikan link");
  return link;
}

const NO_NEWS =
  "Jurnalis tidak menemukan berita baru dari sumber rujukan lab ini";

/** Pilih satu berita terbaru untuk lab; link valid yang belum pernah dipakai. */
async function search(
  store: NewsLabStore,
  lab: NewsLab,
  work: string,
  generate: typeof runConfiguredModel,
) {
  mkdirSync(work, { recursive: true, mode: 0o700 });
  const prompt = jurnalisPrompt(lab, await store.usedUrls());
  writeFileSync(path.join(work, "search-prompt.md"), prompt, { mode: 0o600 });
  const answer = await generate(prompt, "web", work);
  writeFileSync(path.join(work, "search-response.md"), answer, {
    mode: 0o600,
  });
  const raw = parseJurnalisLink(answer);
  let hash: string[] = [];
  try {
    hash = [linkHash(newsSourceKey(String(raw)).url)];
  } catch {}
  const [link] = acceptLinks(
    [raw],
    lab.sources,
    await store.usedHashes(hash),
    1,
  );
  if (!link) throw Error(NO_NEWS);
  return link;
}

/** Tulis artikel final dari satu link dengan prompt artikel milik lab. */
async function write(
  lab: NewsLab,
  link: string,
  work: string,
  generate: typeof runConfiguredModel,
) {
  if (!lab.prompt) throw Error(`Prompt artikel Lab ${lab.theme} belum diisi`);
  const config = normalizeArticleConfig({
    source: "lab",
    labId: lab.id,
    topicMode: "ai",
    context: lab.theme,
    topic: "",
    material: "",
    paragraphCount: null,
  });
  const prompt = configuredArticlePrompt(
    lab.prompt,
    config,
    false,
    lab.theme,
    "",
    [],
    link,
  );
  writeFileSync(path.join(work, "prompt.md"), prompt, { mode: 0o600 });
  const article = await generate(prompt, "lab", work);
  writeFileSync(path.join(work, "article.md"), article, { mode: 0o600 });
  const parsed = validateUnifiedArticle(article, null);
  if (!parsed.ok) throw Error(parsed.errors.join("; "));
  if (!citesLink(parsed.source, link))
    throw Error(
      "Sumber artikel wajib mencantumkan link berita pilihan Jurnalis",
    );
  return { article, parsed, prompt };
}

/**
 * Dipanggil produksi: pilih satu berita paling baru saat ini, catat sebagai
 * terpakai untuk artikel ini, lalu tulis artikel finalnya. Percobaan ulang
 * memakai link yang sama.
 */
export async function labArticle(
  store: NewsLabStore,
  labId: number,
  newsId: number,
  work: string,
  generate = runConfiguredModel,
) {
  const lab = await store.get(labId);
  const held = await store.held(newsId);
  if (!held && !lab.enabled)
    throw Error(`Lab Berita ${lab.theme} sedang nonaktif`);
  await store.working(lab.id);
  try {
    mkdirSync(work, { recursive: true, mode: 0o700 });
    const link = held ?? (await search(store, lab, work, generate));
    if (!held) await store.use(lab.id, link, newsId);
    const result = await write(lab, link, work, generate);
    await store.finish(lab.id, null);
    return { ...result, link };
  } catch (e) {
    await store.finish(lab.id, (e as Error)?.message || "Jurnalis gagal");
    throw e;
  }
}

/** Tes lab: berita terbaru dan artikelnya hanya ditampilkan, tidak dicatat. */
export async function runJurnalisTest(
  store: NewsLabStore,
  lab: NewsLab,
  generate = runConfiguredModel,
  now = Date.now(),
) {
  const work = path.join(
    outputRoot(),
    "jurnalis",
    String(lab.id),
    `tes-${now}`,
  );
  let link: string | null = null;
  try {
    link = await search(store, lab, work, generate);
    const { article } = await write(lab, link, work, generate);
    await store.finishTest(lab.id, { links: [link], article, error: null });
  } catch (e) {
    const message = (e as Error)?.message || "Tes Jurnalis gagal";
    mkdirSync(work, { recursive: true, mode: 0o700 });
    writeFileSync(
      path.join(work, "failure.json"),
      JSON.stringify({ error: message }, null, 2),
      { mode: 0o600 },
    );
    await store.finishTest(lab.id, {
      links: link ? [link] : [],
      article: null,
      error: message,
    });
  }
}
