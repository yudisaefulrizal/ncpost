// Jurnalis Lab Berita, mengikuti pola berita Hermes yang terbukti andal: prompt
// lab dikirim utuh, aturan aplikasi lewat developer_instructions, dan jawaban
// akhir dipaksa JSON lewat --output-schema sehingga artikel tidak tertukar
// dengan pesan proses. Format yang masih rusak diperbaiki sekali tanpa web,
// seperti alur artikel buku.
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
  fillVariables,
  LAB_NEWS_FORMAT,
  validateUnifiedArticle,
} from "../server/content-contract";
import { cliArgs, parseEvents, runCli } from "../server/providers";
import { citesLink } from "./configured-article";

/** Variabel yang boleh dipakai prompt lab. */
export const LAB_VARIABLES = {
  link_berita: "Link berita pilihan Jurnalis",
  konteks: "Tema global lab",
};

export type JurnalisCall = {
  prompt: string;
  work: string;
  name: string;
  search: boolean;
  instructions?: string;
  schema?: object;
};
export type JurnalisModel = (call: JurnalisCall) => Promise<string>;

/** Argumen Codex: web search (code_mode_host) bila perlu, schema, dan instruksi runtime. */
export function jurnalisCliArgs(call: JurnalisCall, schemaPath?: string) {
  const args = call.search
    ? cliArgs.filter(
        (arg, i) =>
          arg !== "code_mode_host" &&
          !(arg === "--disable" && cliArgs[i + 1] === "code_mode_host"),
      )
    : [...cliArgs];
  return [
    ...(call.search ? ["--search"] : []),
    ...args,
    ...(call.search ? ["--enable", "code_mode_host"] : []),
    ...(call.instructions
      ? ["-c", `developer_instructions=${JSON.stringify(call.instructions)}`]
      : []),
    ...(schemaPath ? ["--output-schema", schemaPath] : []),
    ...(process.env.CODEX_MODEL ? ["--model", process.env.CODEX_MODEL] : []),
    "-",
  ];
}

export const runJurnalisModel: JurnalisModel = async (call) => {
  mkdirSync(call.work, { recursive: true, mode: 0o700 });
  const schemaPath = call.schema
    ? path.join(call.work, `${call.name}.schema.json`)
    : undefined;
  if (schemaPath)
    writeFileSync(schemaPath, JSON.stringify(call.schema, null, 2), {
      mode: 0o600,
    });
  const raw = await runCli(
    process.env.CODEX_EXECUTABLE || "codex",
    jurnalisCliArgs(call, schemaPath),
    call.prompt,
    call.work,
    900000,
  );
  writeFileSync(path.join(call.work, `${call.name}.events.jsonl`), raw, {
    mode: 0o600,
  });
  if (
    call.search &&
    !raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .some(
        (e) =>
          e.type === "item.completed" &&
          ["web_search", "web_search_call"].includes(e.item?.type),
      )
  )
    throw Error("Jurnalis tidak memiliki bukti pencarian web");
  return parseEvents(raw);
};

const object = (props: Record<string, string>) => ({
  type: "object",
  properties: Object.fromEntries(
    Object.entries(props).map(([k, description]) => [
      k,
      { type: "string", description },
    ]),
  ),
  required: Object.keys(props),
  additionalProperties: false,
});
export const SEARCH_SCHEMA = object({
  link: "Link lengkap halaman artikel berita terpilih (HTTPS).",
});
export const ARTICLE_SCHEMA = object({
  article:
    "Artikel Markdown final lengkap sesuai format wajib, bukan ringkasan atau pesan proses.",
});
const JSON_ONLY =
  "Integrasi runtime ncpost: keluaran akhir wajib berupa objek JSON sesuai output schema.";

/** Instruksi runtime penulisan; prompt lab sendiri dikirim utuh. */
export function articleInstructions(lab: NewsLab, link: string) {
  return `${JSON_ONLY} Field article berisi artikel Markdown final lengkap, bukan ringkasan atau pesan proses.
Tulis artikel berdasarkan berita pilihan Jurnalis berikut (tema lab: ${lab.theme}). Buka dan baca berita itu dengan pencarian web; jangan memakai berita lain sebagai bahan utama. Cantumkan URL ini pada baris Sumber:
${link}

${LAB_NEWS_FORMAT}`;
}

export function formatFixPrompt(
  article: string,
  errors: string[],
  link: string,
) {
  return `Jangan menggunakan tool, shell, file, atau web. Perbaiki HANYA format artikel berikut agar memenuhi aturan; jangan mengubah isi kalimat. Masalah format: ${JSON.stringify(errors)}. Baris Sumber wajib memuat URL ${link}. Tulis hanya artikel final sesuai aturan berikut.
Artikel:
${article}

Aturan:
${LAB_NEWS_FORMAT}`;
}

function articleErrors(article: string, link: string) {
  const parsed = validateUnifiedArticle(article, null);
  const errors = [...parsed.errors];
  if (!citesLink(parsed.source, link))
    errors.push(
      "Sumber artikel wajib mencantumkan link berita pilihan Jurnalis",
    );
  return { parsed, errors };
}

const NO_NEWS =
  "Jurnalis tidak menemukan berita baru dari sumber rujukan lab ini";

/** Pilih satu berita terbaru untuk lab; link valid yang belum pernah dipakai. */
async function search(
  store: NewsLabStore,
  lab: NewsLab,
  work: string,
  model: JurnalisModel,
) {
  mkdirSync(work, { recursive: true, mode: 0o700 });
  const prompt = jurnalisPrompt(lab, await store.usedUrls());
  writeFileSync(path.join(work, "search-prompt.md"), prompt, { mode: 0o600 });
  const answer = await model({
    prompt,
    work,
    name: "search",
    search: true,
    instructions: JSON_ONLY,
    schema: SEARCH_SCHEMA,
  });
  writeFileSync(path.join(work, "search-response.json"), answer, {
    mode: 0o600,
  });
  const raw = JSON.parse(answer).link;
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
  model: JurnalisModel,
) {
  if (!lab.prompt) throw Error(`Prompt artikel Lab ${lab.theme} belum diisi`);
  const prompt = fillVariables(lab.prompt, {
    link_berita: link,
    konteks: lab.theme,
  });
  const instructions = articleInstructions(lab, link);
  writeFileSync(path.join(work, "prompt.md"), prompt, { mode: 0o600 });
  writeFileSync(path.join(work, "instructions.md"), instructions, {
    mode: 0o600,
  });
  const answer = await model({
    prompt,
    work,
    name: "article",
    search: true,
    instructions,
    schema: ARTICLE_SCHEMA,
  });
  writeFileSync(path.join(work, "response.json"), answer, { mode: 0o600 });
  let article = String(JSON.parse(answer).article ?? "").trim();
  writeFileSync(path.join(work, "article.md"), article, { mode: 0o600 });
  let check = articleErrors(article, link);
  if (check.errors.length) {
    // Perbaikan format sekali tanpa web; isi kalimat tidak diubah.
    writeFileSync(path.join(work, "article.pre-format.md"), article, {
      mode: 0o600,
    });
    article = (
      await model({
        prompt: formatFixPrompt(article, check.errors, link),
        work,
        name: "format",
        search: false,
      })
    ).trim();
    writeFileSync(path.join(work, "article.md"), article, { mode: 0o600 });
    check = articleErrors(article, link);
    if (check.errors.length)
      throw Error("Format artikel tetap rusak: " + check.errors.join("; "));
  }
  return { article, parsed: check.parsed, prompt };
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
  model = runJurnalisModel,
) {
  const lab = await store.get(labId);
  const held = await store.held(newsId);
  if (!held && !lab.enabled)
    throw Error(`Lab Berita ${lab.theme} sedang nonaktif`);
  await store.working(lab.id);
  try {
    mkdirSync(work, { recursive: true, mode: 0o700 });
    const link = held ?? (await search(store, lab, work, model));
    if (!held) await store.use(lab.id, link, newsId);
    const result = await write(lab, link, work, model);
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
  model = runJurnalisModel,
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
    link = await search(store, lab, work, model);
    const { article } = await write(lab, link, work, model);
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
