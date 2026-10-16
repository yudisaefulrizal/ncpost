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
import { runConfiguredModel } from "./configured-article";

/** Ambil daftar link dari jawaban model (JSON, boleh dibungkus blok kode). */
export function parseJurnalisLinks(text: string): unknown[] {
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  if (!json) throw Error("Jurnalis tidak mengembalikan JSON");
  const links = JSON.parse(json).links;
  if (!Array.isArray(links)) throw Error("Jurnalis tidak mengembalikan links");
  return links;
}

/** Satu putaran Jurnalis untuk satu lab: cari berita sampai target hari ini. */
export async function runJurnalis(
  store: NewsLabStore,
  lab: NewsLab,
  generate = runConfiguredModel,
  now = Date.now(),
) {
  const count = lab.dailyTarget - lab.today;
  const work = path.join(outputRoot(), "jurnalis", String(lab.id), String(now));
  mkdirSync(work, { recursive: true, mode: 0o700 });
  try {
    const prompt = jurnalisPrompt(lab, count, await store.usedUrls());
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
      count,
    );
    const added = await store.record(lab.id, links);
    if (!added)
      throw Error(
        "Jurnalis tidak menemukan berita baru dari sumber rujukan lab ini",
      );
    await store.finish(lab.id, null);
  } catch (e) {
    const message = (e as Error)?.message || "Jurnalis gagal";
    writeFileSync(
      path.join(work, "failure.json"),
      JSON.stringify({ error: message }, null, 2),
      { mode: 0o600 },
    );
    await store.finish(lab.id, message);
  }
}
