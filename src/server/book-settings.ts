import { labImageKind } from "./lab-image-types";
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
export const isStockKind = (kind: unknown): kind is string =>
  typeof kind === "string" &&
  (STOCK_KINDS.includes(kind as any) ||
    (!!labImageKind(kind) &&
      !labImageKind(kind)!.quote &&
      !kind.startsWith("S_")));
export const isHorizontalKind = (kind: string) =>
  HORIZONTAL_KINDS.includes(kind) ||
  labImageKind(kind)?.orientation === "horizontal";
export const isVerticalKind = (kind: string) =>
  VERTICAL_KINDS.includes(kind) ||
  labImageKind(kind)?.orientation === "vertikal";
export const isSentenceKind = (kind: string) =>
  kind.startsWith("S_") && isStockKind(baseKind(kind));
const orderKinds = (kinds: string[]) => [
  ...STOCK_KINDS.filter((k) => kinds.includes(k)),
  ...new Set(kinds.filter((k) => !STOCK_KINDS.includes(k as any))),
];
export interface BookSettings {
  labPromptIds?: number[];
  instagramAccountId: string | null;
  youtubeAccountId: string | null;
  tiktokAccountId: string | null;
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
  instagramAccountId: null,
  youtubeAccountId: null,
  tiktokAccountId: null,
  stockKinds: [...STOCK_KINDS],
  sentenceKinds: [],
  sentenceVideoKind: null,
  sentenceVideoHKind: null,
  quoteImageStyle: DEFAULT_QUOTE_IMAGE_STYLE,
  panelHorizontal: "IMAGE_HORIZONTAL",
  panelVertical: "IMAGE_VERTICAL",
};
export function normalizeBookSettings(input: any): BookSettings {
  const instagramAccountId =
    input?.instagramAccountId === ""
      ? null
      : (input?.instagramAccountId ?? null);
  if (
    instagramAccountId !== null &&
    (typeof instagramAccountId !== "string" ||
      !/^\d{1,64}$/.test(instagramAccountId))
  )
    throw Error("ID akun Instagram tidak valid");
  const socialId = (key: string) => {
    const value = input?.[key] || null;
    if (
      value !== null &&
      (typeof value !== "string" || !/^[a-f0-9]{24}$/i.test(value))
    )
      throw Error("ID akun YouTube/TikTok tidak valid");
    return value;
  };
  const pick = (value: unknown, allowed: string[], label: string) => {
    if (value === null || value === undefined || value === "") return null;
    const custom = labImageKind(value);
    const validCustom =
      custom &&
      !custom.quote &&
      typeof value === "string" &&
      !value.startsWith("S_") &&
      (allowed === HORIZONTAL_KINDS
        ? custom.orientation === "horizontal"
        : custom.orientation === "vertikal");
    if (typeof value !== "string" || (!allowed.includes(value) && !validCustom))
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
  const chosen = Array.isArray(input?.stockKinds) ? input.stockKinds : [];
  if (chosen.some((k: unknown) => !isStockKind(k)))
    throw Error("Jenis stok tidak dikenal");
  // Sumber panel selalu ikut dibuat; urutan mengikuti STOCK_KINDS.
  const needed = new Set<string>([
    ...chosen,
    ...[panelHorizontal, panelVertical].filter((k): k is string => !!k),
  ]);
  const sentence = Array.isArray(input?.sentenceKinds)
    ? [...input.sentenceKinds]
    : [];
  if (sentence.some((k: unknown) => !isStockKind(k)))
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
  if (
    !(quoteImageStyle in QUOTE_IMAGE_STYLES) &&
    !labImageKind(quoteImageStyle)?.quote
  )
    throw Error("Gaya gambar quote tidak dikenal");
  const labIds = input?.labPromptIds;
  if (
    labIds !== undefined &&
    (!Array.isArray(labIds) ||
      labIds.length > 100 ||
      labIds.some((id: unknown) => !Number.isSafeInteger(id) || Number(id) < 1))
  )
    throw Error("Pilihan prompt Lab tidak valid");
  return {
    ...(labIds !== undefined
      ? { labPromptIds: [...new Set<number>(labIds)] }
      : {}),
    instagramAccountId,
    youtubeAccountId: socialId("youtubeAccountId"),
    tiktokAccountId: socialId("tiktokAccountId"),
    stockKinds: orderKinds([...needed]),
    sentenceKinds: orderKinds(sentence),
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
