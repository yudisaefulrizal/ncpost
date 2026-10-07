// Semua prompt ada di folder prompts/ (satu file per prompt) agar bisa
// disetel manual. File dibaca ulang setiap dipakai, jadi perubahan langsung
// berlaku tanpa restart. {{nama}} diganti nilai dari kode; placeholder yang
// tidak dikenal menggagalkan job agar salah ketik tidak terkirim ke model.
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./config";
export const PROMPT_ROOT = path.join(ROOT, "prompts");
// Isi file apa adanya; satu baris baru di akhir file diabaikan.
export function readPrompt(name: string) {
  return readFileSync(path.join(PROMPT_ROOT, name), "utf8").replace(
    /\r?\n$/,
    "",
  );
}
export function fillPrompt(name: string, vars: Record<string, string>) {
  return readPrompt(name).replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in vars))
      throw Error(`Placeholder {{${key}}} tidak dikenal di prompts/${name}`);
    return vars[key];
  });
}
// Artikel: aturan.md disisipkan utuh ke prompt tulis/revisi/format.
type ArticleInput = { book: string; title: string };
const articleVars = (c: ArticleInput) => ({
  buku: JSON.stringify(c.book),
  bab: JSON.stringify(c.title),
  aturan: readPrompt("artikel/aturan.md"),
});
export const articleWritePrompt = (c: ArticleInput) =>
  fillPrompt("artikel/tulis.md", articleVars(c));
export const articleReviewPrompt = (
  c: ArticleInput,
  article: string,
  checks: string[],
  lintFindings: unknown,
) =>
  fillPrompt("artikel/review.md", {
    buku: JSON.stringify(c.book),
    bab: JSON.stringify(c.title),
    id_cek: JSON.stringify(checks),
    temuan_lint: JSON.stringify(lintFindings),
    artikel: article,
  });
export const articleRevisePrompt = (
  c: ArticleInput,
  article: string,
  report: unknown,
) =>
  fillPrompt("artikel/revisi.md", {
    ...articleVars(c),
    laporan: JSON.stringify(report),
    artikel: article,
  });
export const articleFormatPrompt = (
  c: ArticleInput,
  article: string,
  errors: string[],
) =>
  fillPrompt("artikel/format.md", {
    ...articleVars(c),
    masalah: JSON.stringify(errors),
    artikel: article,
  });
// Hook: instruksi lalu kelima paragraf (tanpa judul/heading).
export const hookPrompt = (paragraphs: string[]) =>
  fillPrompt("hook/hook.md", { artikel: paragraphs.join("\n\n") });
// Quote: instruksi lalu seluruh paragraf artikel final (tanpa judul/heading).
export const quotePrompt = (paragraphs: string[]) =>
  fillPrompt("quote/quote.md", { paragraf: paragraphs.join("\n\n") });
const QUOTE_IMAGE_FILES: Record<string, string> = {
  QUOTE_PAPERCUT: "quote/gambar-papercut.md",
  QUOTE_REALISTIC: "quote/gambar-realistis.md",
};
export function quoteImagePrompt(style: string, quote: string) {
  const file = QUOTE_IMAGE_FILES[style];
  if (!file) throw Error("Gaya gambar quote tidak dikenal");
  return fillPrompt(file, { quote });
}
// Stok gambar per lajur. {{teks}}: lajur realistic = "heading — paragraf"
// (panel) atau kalimat; lajur lain = heading panel atau kalimat.
const STOCK_FILES: Record<string, string> = {
  IMAGE_HORIZONTAL: "stok/realistic-horizontal.md",
  IMAGE_VERTICAL: "stok/realistic-vertikal.md",
  IMAGE_MINIMALIST: "stok/minimalist-vertikal.md",
  IMAGE_PAPERCUT: "stok/papercut-vertikal.md",
  IMAGE_PAPERCUT_HORIZONTAL: "stok/papercut-horizontal.md",
};
const WITH_PARAGRAPH = ["IMAGE_HORIZONTAL", "IMAGE_VERTICAL"];
export function stockPrompt(kind: string, heading: string, paragraph: string) {
  const file = STOCK_FILES[kind];
  if (!file) throw Error("Jenis stok tidak dikenal");
  const teks =
    WITH_PARAGRAPH.includes(kind) && paragraph
      ? `${heading} — ${paragraph}`
      : heading;
  return fillPrompt(file, { teks });
}
// Pembungkus mekanis untuk tool image_generation Codex.
export const codexImagePrompt = (prompt: string) =>
  fillPrompt("gambar/pembungkus-codex.md", { prompt });
