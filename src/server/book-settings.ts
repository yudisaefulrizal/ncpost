// Pengaturan konten per judul buku: lajur stok yang dibuat dan sumber gambar
// panel (horizontal untuk template 1/2/6, vertikal untuk 4/4B); video memakai
// panel yang sama. Dipakai server, worker, dan tampilan.
import { QUOTE_IMAGE_STYLES, DEFAULT_QUOTE_IMAGE_STYLE } from "./quote-prompt";
// Satu-satunya daftar jenis stok; IMAGE_PAPERCUT adalah paper cut vertikal.
export const STOCK_KINDS = [
  "IMAGE_HORIZONTAL",
  "IMAGE_VERTICAL",
  "IMAGE_MINIMALIST",
  "IMAGE_PAPERCUT",
  "IMAGE_PAPERCUT_HORIZONTAL",
] as const;
// Gambar per kalimat: lajur dan prompt sama dengan stok panel, job berawalan S_.
export const SENTENCE_PREFIX = "S_";
export const sentenceJob = (kind: string) => SENTENCE_PREFIX + kind;
export const baseKind = (kind: string) =>
  kind.startsWith(SENTENCE_PREFIX) ? kind.slice(SENTENCE_PREFIX.length) : kind;
export const SENTENCE_KINDS = STOCK_KINDS.map(sentenceJob);
export const HORIZONTAL_KINDS = [
  "IMAGE_HORIZONTAL",
  "IMAGE_PAPERCUT_HORIZONTAL",
];
export const VERTICAL_KINDS = [
  "IMAGE_VERTICAL",
  "IMAGE_MINIMALIST",
  "IMAGE_PAPERCUT",
];
export interface BookSettings {
  stockKinds: string[];
  sentenceKinds: string[];
  // Lajur vertikal untuk Video Kalimat 1080×1920 (selalu ikut dibuat).
  sentenceVideoKind: string | null;
  // Lajur horizontal untuk Video Kalimat H (selalu ikut dibuat).
  sentenceVideoHKind: string | null;
  quoteImageStyle: string;
  panelHorizontal: string | null;
  panelVertical: string | null;
}
// Sama dengan perilaku sebelum ada pengaturan per buku.
export const DEFAULT_BOOK_SETTINGS: BookSettings = {
  stockKinds: [...STOCK_KINDS],
  sentenceKinds: [],
  sentenceVideoKind: null,
  sentenceVideoHKind: null,
  quoteImageStyle: DEFAULT_QUOTE_IMAGE_STYLE,
  panelHorizontal: "IMAGE_HORIZONTAL",
  panelVertical: "IMAGE_VERTICAL",
};
export function normalizeBookSettings(input: any): BookSettings {
  const pick = (value: unknown, allowed: string[], label: string) => {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value !== "string" || !allowed.includes(value))
      throw Error(`${label} tidak dikenal`);
    return value;
  };
  const panelHorizontal = pick(
    input?.panelHorizontal,
    HORIZONTAL_KINDS,
    "Sumber panel horizontal",
  );
  const panelVertical = pick(
    input?.panelVertical,
    VERTICAL_KINDS,
    "Sumber panel vertikal",
  );
  if (!panelHorizontal && !panelVertical)
    throw Error("Panel butuh minimal satu sumber gambar");
  const chosen = Array.isArray(input?.stockKinds) ? input.stockKinds : [];
  if (chosen.some((k: unknown) => !STOCK_KINDS.includes(k as any)))
    throw Error("Jenis stok tidak dikenal");
  // Sumber panel selalu ikut dibuat; urutan mengikuti STOCK_KINDS.
  const needed = new Set<string>([
    ...chosen,
    ...[panelHorizontal, panelVertical].filter((k): k is string => !!k),
  ]);
  const sentence = Array.isArray(input?.sentenceKinds)
    ? input.sentenceKinds
    : [];
  if (sentence.some((k: unknown) => !STOCK_KINDS.includes(k as any)))
    throw Error("Jenis gambar kalimat tidak dikenal");
  const sentenceVideoKind = pick(
    input?.sentenceVideoKind,
    VERTICAL_KINDS,
    "Sumber video kalimat vertikal",
  );
  if (sentenceVideoKind) sentence.push(sentenceVideoKind);
  const sentenceVideoHKind = pick(
    input?.sentenceVideoHKind,
    HORIZONTAL_KINDS,
    "Sumber video kalimat horizontal",
  );
  if (sentenceVideoHKind) sentence.push(sentenceVideoHKind);
  const quoteImageStyle = input?.quoteImageStyle ?? DEFAULT_QUOTE_IMAGE_STYLE;
  if (!(quoteImageStyle in QUOTE_IMAGE_STYLES))
    throw Error("Gaya gambar quote tidak dikenal");
  return {
    stockKinds: STOCK_KINDS.filter((k) => needed.has(k)),
    sentenceKinds: STOCK_KINDS.filter((k) => sentence.includes(k)),
    sentenceVideoKind,
    sentenceVideoHKind,
    quoteImageStyle,
    panelHorizontal,
    panelVertical,
  };
}
export function panelSources(s: BookSettings) {
  return [s.panelHorizontal, s.panelVertical].filter((k): k is string => !!k);
}
