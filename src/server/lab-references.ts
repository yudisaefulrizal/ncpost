import { readPrompt } from "./prompts";
import type { LabKind } from "./lab";
const REFERENCES = [
  {
    id: "quote",
    kind: "quote",
    name: "Quote",
    file: "quote/quote.md",
    orientation: "bebas",
  },
  {
    id: "book",
    kind: "article",
    name: "Artikel buku",
    file: "artikel/aturan.md",
    orientation: "bebas",
  },
  {
    id: "news",
    kind: "article",
    name: "Artikel berita teknologi",
    file: "berita/skill-artikel-teknologi.md",
    orientation: "bebas",
  },
  {
    id: "IMAGE_HORIZONTAL",
    kind: "image",
    name: "Realistic horizontal",
    file: "stok/realistic-horizontal.md",
    orientation: "horizontal",
  },
  {
    id: "IMAGE_VERTICAL",
    kind: "image",
    name: "Realistic vertikal",
    file: "stok/realistic-vertikal.md",
    orientation: "vertikal",
  },
  {
    id: "IMAGE_MINIMALIST",
    kind: "image",
    name: "Minimalist vertikal",
    file: "stok/minimalist-vertikal.md",
    orientation: "vertikal",
  },
  {
    id: "IMAGE_PAPERCUT",
    kind: "image",
    name: "Paper cut vertikal",
    file: "stok/papercut-vertikal.md",
    orientation: "vertikal",
  },
  {
    id: "IMAGE_PAPERCUT_HORIZONTAL",
    kind: "image",
    name: "Paper cut horizontal",
    file: "stok/papercut-horizontal.md",
    orientation: "horizontal",
  },
  {
    id: "QUOTE_PAPERCUT",
    kind: "image",
    name: "Gambar quote · Paper cut",
    file: "quote/gambar-papercut.md",
    orientation: "bebas",
  },
  {
    id: "QUOTE_REALISTIC",
    kind: "image",
    name: "Gambar quote · Realistis",
    file: "quote/gambar-realistis.md",
    orientation: "bebas",
  },
] as const;
export function labReferences(kind: LabKind) {
  return REFERENCES.filter((r) => r.kind === kind).map((r) => ({
    ...r,
    prompt: readPrompt(r.file),
  }));
}
export function resolveLabPrompt(
  kind: LabKind,
  reference: string | null,
  template: string,
) {
  if (!reference) return template;
  const ref = REFERENCES.find((r) => r.id === reference && r.kind === kind);
  if (!ref) throw Error("Referensi prompt Lab tidak valid");
  const variables: Record<string, string> = {
    buku: JSON.stringify("How to Win Friends and Influence People"),
    bab: JSON.stringify("Menghargai sudut pandang orang lain"),
    teks: "Menghargai sudut pandang orang lain — Dua orang bekerja sama menyelesaikan masalah dengan mendengarkan satu sama lain.",
    paragraf:
      "Dua orang bekerja sama dengan mendengarkan satu sama lain dan menghargai sudut pandang yang berbeda.",
    quote: "Dengarkan untuk memahami. Hargai sudut pandang orang lain.",
  };
  const fill = (text: string) =>
    text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      if (!(key in variables))
        throw Error(`Placeholder {{${key}}} tidak dikenal`);
      return variables[key];
    });
  if (reference === "book")
    return fill(readPrompt("artikel/tulis.md").replace("{{aturan}}", template));
  if (reference === "news") return template;
  return fill(template);
}
