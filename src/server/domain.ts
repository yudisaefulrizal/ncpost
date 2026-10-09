import { STOCK_KINDS, isStockKind, isSentenceKind } from "./book-settings";
import { stripMarkdownEmphasis } from "./stock-prompts";
// Artikel final = paragraf hook (di bawah heading hook) + lima paragraf isi.
export const PANEL_COUNT = 6;
// Kalimat artikel final (dipotong per . ! ?) berurutan dari paragraf 1–6.
export function articleSentences(article: string) {
  return validateArticle(article).paragraphs.flatMap((p, i) =>
    stripMarkdownEmphasis(p)
      .trim()
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean)
      .map((text) => ({ paragraph: i + 1, text })),
  );
}
// Draf dari Codex (sebelum hook): heading identik judul + lima paragraf.
export function validateDraft(raw: string) {
  return parseArticle(raw, true);
}
// Artikel final: judul, heading hook, paragraf hook + lima paragraf.
export function validateArticle(raw: string) {
  return parseArticle(raw, false);
}
function parseArticle(raw: string, draft: boolean) {
  const errors: string[] = [];
  const lines = raw.trim().replace(/\r\n/g, "\n").split("\n");
  const titles = lines.filter((s) => /^# /.test(s)),
    headings = lines.filter((s) => /^## /.test(s));
  const title = titles[0]?.slice(2).trim() ?? "";
  const heading = headings[0]?.slice(3).trim() ?? "";
  if (draft) {
    if (
      titles.length !== 1 ||
      headings.length !== 1 ||
      heading !== title ||
      !title
    )
      errors.push("Satu judul dan satu heading identik wajib ada.");
  } else if (titles.length !== 1 || headings.length !== 1 || !title || !heading)
    errors.push("Satu judul dan satu heading hook wajib ada.");
  if (lines[0] !== `# ${title}` || /^(Kenapa|Mengapa)\b/i.test(title))
    errors.push("Judul harus di awal dan tidak diawali Kenapa/Mengapa.");
  const headingIndex = lines.findIndex((s) => s.startsWith("## "));
  if (lines.slice(1, headingIndex).some((s) => s.trim()))
    errors.push("Heading harus mendahului paragraf pertama.");
  const at = lines.findIndex((s) => s.startsWith("Berdasarkan buku "));
  const paragraphs = lines
    .slice(headingIndex + 1, at < 0 ? lines.length : at)
    .join("\n")
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean);
  const counts = paragraphs.map((s) => s.split(/\s+/).filter(Boolean).length);
  if (draft && paragraphs.length !== 5) errors.push("Isi wajib lima paragraf.");
  if (!draft && paragraphs.length !== PANEL_COUNT)
    errors.push("Isi wajib paragraf hook dan lima paragraf.");
  if (paragraphs.some((s) => /(^|\n)#|<[^>]+>|https?:\/\/|(^|\n)Tag:/.test(s)))
    errors.push(
      "Heading tambahan, URL, tag dalam isi atau HTML tidak diizinkan.",
    );
  const attribution = lines[at] ?? "";
  if (
    at < 0 ||
    !/^Berdasarkan buku .+\.$/.test(attribution) ||
    lines[at - 1]?.trim()
  )
    errors.push("Atribusi terpisah wajib setelah isi.");
  const tail = lines.slice(at + 1).filter((s) => s.trim());
  const tag = tail[0] ?? "";
  const tags = tag
    .replace(/^Tag:\s*/, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    tail.length !== 1 ||
    !tag.startsWith("Tag:") ||
    !tags.length ||
    tags.length > 5 ||
    tags.some((s) => !/^#?[\p{L}\p{N}_][\p{L}\p{N}_ -]*$/u.test(s))
  )
    errors.push("Tag: wajib paling akhir, maksimal lima tag dipisahkan koma.");
  return {
    ok: errors.length === 0,
    errors,
    title,
    heading,
    paragraphs,
    counts,
    attribution,
    tags,
  };
}
// Keluaran prompt hook: baris pertama = heading (tanda #/** dibuang), sisanya
// = satu paragraf hook.
export function parseHook(output: string) {
  const lines = output
    .trim()
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const heading = (lines[0] ?? "")
    .replace(/^#+\s*/, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .trim();
  const paragraph = lines.slice(1).join(" ").trim();
  if (!heading || !paragraph)
    throw Error("Hook harus berisi satu heading dan satu paragraf");
  return { heading, paragraph };
}
// Gabungkan draf final dengan hook: heading draf diganti heading hook,
// paragraf hook menjadi paragraf pertama.
export function mergeHook(
  draft: string,
  hook: { heading: string; paragraph: string },
) {
  const v = validateDraft(draft);
  if (!v.ok) throw Error("Draf belum valid: " + v.errors.join("; "));
  const tag = draft
    .trim()
    .split("\n")
    .find((l) => l.startsWith("Tag:"))!;
  return [
    `# ${v.title}`,
    `## ${hook.heading}`,
    hook.paragraph,
    ...v.paragraphs,
    v.attribution,
    tag,
  ].join("\n\n");
}
// Nomor bagian dalam bukunya: nilai part_number (bisa diedit, unik per buku);
// bila kosong, urutan input. Nama buku dibandingkan tanpa beda huruf
// besar/kecil.
export const bookKey = (book: string) =>
  book.replace(/\s+/g, " ").trim().toLowerCase();
export function partNumber<
  T extends {
    id: number;
    book: string;
    part_number?: number | null;
    content_type_id?: number;
  },
>(rows: T[], c: T) {
  if (c.part_number != null) return c.part_number;
  return rows.filter(
    (x) =>
      bookKey(x.book) === bookKey(c.book) &&
      (x.content_type_id ?? 1) === (c.content_type_id ?? 1) &&
      x.id <= c.id,
  ).length;
}
// Caption Instagram (skill-ncpost-buku-produksi §3): artikel final sebagai teks
// biasa, memuat #buku dan seluruh tag artikel tanpa duplikat, maks 2.200 karakter.
export function instagramCaption(article: string) {
  const v = validateArticle(article);
  const plain = (t: string) =>
    t.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
  const tags = [
    ...new Set(
      ["buku", ...v.tags].map(
        (t) =>
          "#" +
          t
            .replace(/^#/, "")
            .toLowerCase()
            .replace(/[^\p{L}\p{N}_]/gu, ""),
      ),
    ),
  ].filter((t) => t.length > 1);
  const tail = [plain(v.attribution), tags.join(" ")].filter(Boolean);
  let body = v.paragraphs.map(plain);
  const build = () =>
    [plain(v.title), ...body, ...tail].filter(Boolean).join("\n\n");
  // Bila terlalu panjang, paragraf terakhir dikurangi; judul, atribusi, dan tag tetap utuh.
  while ([...build()].length > 2200 && body.length > 1)
    body = body.slice(0, -1);
  return [...build()].slice(0, 2200).join("");
}
// Aturan job paralel per bagian: Artikel/Review mengubah artikel sehingga
// berjalan sendiri; Panel menunggu job stok yang antre lebih dulu (sumber
// panel bisa lajur mana pun sesuai Pengaturan Konten); Post IG menunggu
// Panel; Video menunggu Panel dan TTS; Reels IG menunggu Video. Job bagian lain selalu boleh berjalan.
const EXCLUSIVE_JOBS = ["ARTICLE", "EDITOR"];
const JOB_DEPENDS: Record<string, string[]> = {
  PANEL: [...STOCK_KINDS],
  POST_IG: ["PANEL"],
  QUOTE_IMAGE: ["QUOTE"],
  REELS_IG: ["VIDEO_KALIMAT"],
  VIDEO_KALIMAT: ["TTS_KALIMAT", ...STOCK_KINDS.map((k) => "S_" + k)],
  VIDEO_KALIMAT_H: ["TTS_KALIMAT", ...STOCK_KINDS.map((k) => "S_" + k)],
};
// Pembuatan video memakai hampir seluruh CPU dan RAM server, jadi hanya satu
// job video yang boleh berjalan di seluruh sistem (lintas bagian), berurutan
// menurut antrean.
export const VIDEO_JOBS = ["VIDEO_KALIMAT", "VIDEO_KALIMAT_H"];
type ActiveJob = {
  id: number;
  chapter_id: number;
  kind: string;
  state: string;
};
export function canStart(j: ActiveJob, active: ActiveJob[]) {
  const needs = JOB_DEPENDS[j.kind] ?? [];
  if (
    VIDEO_JOBS.includes(j.kind) &&
    active.some(
      (o) =>
        o.id !== j.id &&
        VIDEO_JOBS.includes(o.kind) &&
        (o.state === "running" || o.id < j.id),
    )
  )
    return false;
  return !active.some(
    (o) =>
      o.id !== j.id &&
      o.chapter_id === j.chapter_id &&
      (o.state === "running" || o.id < j.id) &&
      (EXCLUSIVE_JOBS.includes(o.kind) ||
        EXCLUSIVE_JOBS.includes(j.kind) ||
        needs.includes(o.kind) ||
        (j.kind === "PANEL" && isStockKind(o.kind)) ||
        (VIDEO_JOBS.includes(j.kind) && isSentenceKind(o.kind))),
  );
}
export function roundRobin<T extends { book: string }>(items: T[]): T[] {
  const positions = new Map<string, number>(),
    books = new Map<string, number>();
  return items
    .map((x) => {
      if (!books.has(x.book)) books.set(x.book, books.size);
      const pos = (positions.get(x.book) ?? 0) + 1;
      positions.set(x.book, pos);
      return { x, pos, rank: books.get(x.book)! };
    })
    .sort((a, b) => a.pos - b.pos || a.rank - b.rank)
    .map((x) => x.x);
}
