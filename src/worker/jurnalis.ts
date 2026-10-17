// Jurnalis Lab Berita. Pencarian web hanya untuk memilih link; isi berita diunduh
// aplikasi sendiri (news-fetch) karena pencarian web Codex bukan browser. Penulisan
// tanpa web seperti alur artikel buku: prompt lab dikirim apa adanya, bahan dan
// aturan aplikasi lewat developer_instructions, dan jawaban akhir dipaksa JSON
// lewat --output-schema seperti berita Hermes. Format yang masih rusak diperbaiki
// sekali tanpa web.
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
  LAB_NEWS_FORMAT,
  validateUnifiedArticle,
} from "../server/content-contract";
import { cliArgs, parseEvents, runCli } from "../server/providers";
import { citesLink } from "./configured-article";
import { live } from "../server/live";
import {
  fetchNewsText,
  NewsUnreachable,
  type NewsText,
} from "../server/news-fetch";

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
/** Berapa kali Jurnalis mencari berita lain bila link tidak bisa diakses. */
export const JURNALIS_ATTEMPTS = 3;
const JSON_ONLY =
  "Integrasi runtime ncpost: keluaran akhir wajib berupa objek JSON sesuai output schema.";

/** Instruksi runtime penulisan; prompt lab sendiri dikirim utuh. */
export function articleInstructions(lab: NewsLab, news: NewsText) {
  return `${JSON_ONLY} Field article berisi artikel Markdown final lengkap, bukan ringkasan atau pesan proses.
Jangan menggunakan tool, shell, file, atau web. Tulis artikel hanya berdasarkan bahan berita pilihan Jurnalis di bawah (tema lab: ${lab.theme}); jangan menambah fakta, angka, nama, atau kutipan yang tidak ada di bahan. Cantumkan URL ini pada baris Sumber:
${news.url}

Bahan berita (diunduh aplikasi dari URL di atas):
Judul asli: ${news.title || "-"}
Media: ${news.siteName || new URL(news.url).hostname}
Terbit: ${news.published || "-"}

${news.text}

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
  exclude: string[] = [],
) {
  mkdirSync(work, { recursive: true, mode: 0o700 });
  live(`Mencari berita terbaru · ${lab.theme}`);
  const prompt = jurnalisPrompt(lab, [
    ...new Set([...exclude, ...(await store.usedUrls())]),
  ]);
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
  const used = await store.usedHashes(hash);
  for (const url of exclude) used.add(linkHash(url));
  const [link] = acceptLinks([raw], lab.sources, used, 1);
  if (!link) throw Error(NO_NEWS);
  return link;
}

/** Tulis artikel final dari satu link dengan prompt artikel milik lab. */
async function write(
  lab: NewsLab,
  link: string,
  work: string,
  model: JurnalisModel,
  fetchText: typeof fetchNewsText,
) {
  if (!lab.prompt) throw Error(`Prompt artikel Lab ${lab.theme} belum diisi`);
  // Isi berita diunduh aplikasi; gagal unduh = berita tidak bisa diakses.
  live(`Membaca berita: ${link}`);
  const news = await fetchText(link);
  live(`Menulis artikel: ${news.title || link}`);
  writeFileSync(path.join(work, "source.md"), `${news.title}\n\n${news.text}`, {
    mode: 0o600,
  });
  // Prompt lab dikirim apa adanya; bahan, link, dan tema ada di instruksi runtime.
  const prompt = lab.prompt;
  const instructions = articleInstructions(lab, news);
  writeFileSync(path.join(work, "prompt.md"), prompt, { mode: 0o600 });
  writeFileSync(path.join(work, "instructions.md"), instructions, {
    mode: 0o600,
  });
  const answer = await model({
    prompt,
    work,
    name: "article",
    search: false,
    instructions,
    schema: ARTICLE_SCHEMA,
  });
  writeFileSync(path.join(work, "response.json"), answer, { mode: 0o600 });
  let article = String(JSON.parse(answer).article ?? "").trim();
  writeFileSync(path.join(work, "article.md"), article, { mode: 0o600 });
  let check = articleErrors(article, link);
  // Perbaikan format hanya merapikan isi yang sudah ada. Jawaban tanpa paragraf
  // bukan artikel; memperbaikinya tanpa sumber hanya membuat model mengarang.
  if (check.errors.length && !check.parsed.paragraphs.length)
    throw Error(
      "Jawaban model bukan artikel (tanpa paragraf isi); tidak diperbaiki agar isi tidak dikarang",
    );
  if (check.errors.length) {
    // Perbaikan format sekali tanpa web; isi kalimat tidak diubah.
    live("Merapikan format artikel…");
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
 * terpakai untuk artikel ini, lalu tulis artikel finalnya. Bila link tidak bisa
 * diakses, link itu dilepas (tetap tercatat terpakai) dan Jurnalis mencari
 * berita lain, maksimal JURNALIS_ATTEMPTS kali. Percobaan ulang karena sebab
 * lain memakai link yang sama.
 */
export async function labArticle(
  store: NewsLabStore,
  labId: number,
  newsId: number,
  work: string,
  model = runJurnalisModel,
  fetchText = fetchNewsText,
) {
  const lab = await store.get(labId);
  let held = await store.held(newsId);
  if (!held && !lab.enabled)
    throw Error(`Lab Berita ${lab.theme} sedang nonaktif`);
  await store.working(lab.id);
  const tried: string[] = [];
  try {
    for (let attempt = 1; ; attempt++) {
      const dir = path.join(work, `percobaan-${attempt}`);
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const link = held ?? (await search(store, lab, dir, model, tried));
      if (!held) await store.use(lab.id, link, newsId);
      try {
        const result = await write(lab, link, dir, model, fetchText);
        await store.finish(lab.id, null);
        return { ...result, link };
      } catch (e) {
        if (!(e instanceof NewsUnreachable)) throw e;
        await store.release(newsId, link);
        tried.push(link);
        held = null;
        if (attempt >= JURNALIS_ATTEMPTS)
          throw Error(
            `${JURNALIS_ATTEMPTS} berita berturut-turut tidak bisa diakses: ${tried.join(", ")}`,
          );
      }
    }
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
  fetchText = fetchNewsText,
) {
  const work = path.join(
    outputRoot(),
    "jurnalis",
    String(lab.id),
    `tes-${now}`,
  );
  let link: string | null = null;
  const tried: string[] = [];
  try {
    for (let attempt = 1; ; attempt++) {
      const dir = path.join(work, `percobaan-${attempt}`);
      link = await search(store, lab, dir, model, tried);
      try {
        const { article } = await write(lab, link, dir, model, fetchText);
        await store.finishTest(lab.id, { links: [link], article, error: null });
        return;
      } catch (e) {
        if (!(e instanceof NewsUnreachable) || attempt >= JURNALIS_ATTEMPTS)
          throw e;
        tried.push(link);
      }
    }
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
