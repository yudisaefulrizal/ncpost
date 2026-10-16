import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { outputRoot } from "../server/output-paths";
import {
  acceptLinks,
  jurnalisPrompt,
  JURNALIS_CANDIDATES,
  linkHash,
  type NewsLab,
  NewsLabStore,
} from "../server/news-lab";
import { newsSourceKey } from "../server/news";
import { runConfiguredModel } from "./configured-article";

/** Ambil daftar link dari jawaban model (JSON, boleh dibungkus blok kode). */
export function parseJurnalisLinks(text: string): unknown[] {
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  if (!json) throw Error("Jurnalis tidak mengembalikan JSON");
  const links = JSON.parse(json).links;
  if (!Array.isArray(links)) throw Error("Jurnalis tidak mengembalikan links");
  return links;
}

const NO_NEWS =
  "Jurnalis tidak menemukan berita baru dari sumber rujukan lab ini";

/** Cari berita terbaru untuk satu lab; hasilnya link valid yang belum dipakai. */
async function search(
  store: NewsLabStore,
  lab: NewsLab,
  work: string,
  generate: typeof runConfiguredModel,
) {
  mkdirSync(work, { recursive: true, mode: 0o700 });
  const prompt = jurnalisPrompt(lab, await store.usedUrls());
  writeFileSync(path.join(work, "prompt.md"), prompt, { mode: 0o600 });
  const answer = await generate(prompt, "web", work);
  writeFileSync(path.join(work, "response.md"), answer, { mode: 0o600 });
  const raw = parseJurnalisLinks(answer);
  const hashes = raw.flatMap((u) => {
    try {
      return typeof u === "string" ? [linkHash(newsSourceKey(u).url)] : [];
    } catch {
      return [];
    }
  });
  const links = acceptLinks(
    raw,
    lab.sources,
    await store.usedHashes(hashes),
    JURNALIS_CANDIDATES,
  );
  if (!links.length) throw Error(NO_NEWS);
  return links;
}

/**
 * Dipanggil produksi artikel: cari berita paling baru saat ini, catat sebagai
 * terpakai untuk artikel ini. Percobaan ulang memakai link yang sama.
 */
export async function newsForArticle(
  store: NewsLabStore,
  labId: number,
  newsId: number,
  work: string,
  generate = runConfiguredModel,
) {
  const held = await store.held(newsId);
  if (held) return held;
  const lab = await store.get(labId);
  if (!lab.enabled) throw Error(`Lab Berita ${lab.theme} sedang nonaktif`);
  await store.working(lab.id);
  try {
    const [link] = await search(store, lab, work, generate);
    await store.use(lab.id, link, newsId);
    await store.finish(lab.id, null);
    return link;
  } catch (e) {
    await store.finish(lab.id, (e as Error)?.message || "Jurnalis gagal");
    throw e;
  }
}

/** Tes lab: berita terbaru yang ditemukan hanya ditampilkan, tidak dicatat. */
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
  try {
    await store.finishTest(
      lab.id,
      await search(store, lab, work, generate),
      null,
    );
  } catch (e) {
    const message = (e as Error)?.message || "Tes Jurnalis gagal";
    writeFileSync(
      path.join(work, "failure.json"),
      JSON.stringify({ error: message }, null, 2),
      { mode: 0o600 },
    );
    await store.finishTest(lab.id, [], message);
  }
}
