import {
  DEFAULT_BOOK_SETTINGS,
  normalizeBookSettings,
  type BookSettings,
} from "./book-settings";
export const CONTENT_OUTPUTS = [
  ["ARTICLE", "Artikel"],
  ["QUOTE", "Quote"],
  ["QUOTE_IMAGE", "Gambar Quote"],
  ["POST_IMAGE", "Gambar per seluruh teks"],
  ["IMAGES_PANEL", "Gambar Panel"],
  ["IMAGES_VIDEO", "Gambar Video"],
  ["TTS_KALIMAT", "Audio"],
  ["VIDEO_KALIMAT", "Video V"],
  ["VIDEO_KALIMAT_H", "Video H"],
  ["PANEL", "Panel"],
] as const;
export const FINAL_OUTPUTS = [
  ["VIDEO_KALIMAT", "Video vertikal"],
  ["VIDEO_KALIMAT_H", "Video horizontal"],
  ["PANEL", "Carousel"],
  ["POST_IMAGE", "1 gambar"],
] as const;
export const isFinalOutput = (key: string) =>
  FINAL_OUTPUTS.some(([kind]) => kind === key);
export interface ContentType {
  id: number;
  name: string;
  engine: "book" | "news";
  outputs: string[];
  settings: BookSettings | null;
}
export function contentStages(
  type: Pick<ContentType, "outputs"> & Partial<Pick<ContentType, "settings">>,
) {
  const stages = new Set(["ARTICLE", ...type.outputs]);
  if (stages.has("QUOTE_IMAGE")) stages.add("QUOTE");
  if (stages.has("PANEL") && type.settings?.carouselMode !== "direct")
    stages.add("IMAGES_PANEL");
  if (stages.has("VIDEO_KALIMAT") || stages.has("VIDEO_KALIMAT_H")) {
    stages.add("IMAGES_VIDEO");
    stages.add("TTS_KALIMAT");
  }
  return stages;
}
export function contentAllows(type: ContentType, kind: string) {
  const stages = contentStages(type);
  if (["EDITOR", "PREVIEW"].includes(kind)) return true;
  if (kind === "POST_IG") return stages.has("PANEL");
  if (kind === "REELS_IG") return stages.has("VIDEO_KALIMAT");
  if (kind.startsWith("S_IMAGE_")) return stages.has("IMAGES_VIDEO");
  if (kind.startsWith("IMAGE_")) return stages.has("IMAGES_PANEL");
  return stages.has(kind);
}
export function normalizeContentType(input: any) {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 190)
    throw Error("Nama jenis wajib diisi, maksimal 190 karakter");
  if (!["book", "news"].includes(input.engine))
    throw Error("Sumber artikel tidak dikenal");
  const allowed = CONTENT_OUTPUTS.filter(
    ([key]) =>
      input.engine === "book" || !["QUOTE", "QUOTE_IMAGE"].includes(key),
  ).map(([key]) => key as string);
  if (
    !Array.isArray(input.outputs) ||
    !input.outputs.length ||
    input.outputs.some(
      (key: unknown) => typeof key !== "string" || !allowed.includes(key),
    )
  )
    throw Error("Pilih keluaran konten yang valid");
  const outputs = [...new Set<string>(input.outputs)];
  if (input.settings?.managed && outputs.some((key) => !isFinalOutput(key)))
    throw Error("Pilih target hasil akhir");
  const stages = contentStages({ outputs, settings: input.settings });
  const defaults = {
    ...DEFAULT_BOOK_SETTINGS,
    stockKinds: stages.has("IMAGES_PANEL") ? ["IMAGE_HORIZONTAL"] : [],
    sentenceKinds: [],
    panelHorizontal: stages.has("PANEL") ? "IMAGE_HORIZONTAL" : null,
    panelVertical: null,
    sentenceVideoKind: stages.has("VIDEO_KALIMAT") ? "IMAGE_VERTICAL" : null,
    sentenceVideoHKind: stages.has("VIDEO_KALIMAT_H")
      ? "IMAGE_HORIZONTAL"
      : null,
  };
  const settings = normalizeBookSettings(input.settings ?? defaults);
  if (
    stages.has("PANEL") &&
    !settings.panelHorizontal &&
    !settings.panelVertical
  )
    throw Error("Panel membutuhkan sumber gambar");
  if (stages.has("IMAGES_PANEL") && !settings.stockKinds.length)
    throw Error("Pilih jenis gambar panel");
  if (stages.has("IMAGES_VIDEO") && !settings.sentenceKinds.length) {
    settings.sentenceKinds = ["IMAGE_VERTICAL"];
  }
  if (stages.has("VIDEO_KALIMAT") && !settings.sentenceVideoKind)
    throw Error("Video V membutuhkan sumber gambar vertikal");
  if (stages.has("VIDEO_KALIMAT_H") && !settings.sentenceVideoHKind)
    throw Error("Video H membutuhkan sumber gambar horizontal");
  if (!stages.has("PANEL")) {
    settings.panelHorizontal = null;
    settings.panelVertical = null;
  }
  if (stages.has("PANEL") && !outputs.includes("IMAGES_PANEL"))
    settings.stockKinds = [
      settings.panelHorizontal,
      settings.panelVertical,
    ].filter((k): k is string => !!k);
  if (!stages.has("IMAGES_PANEL")) {
    settings.stockKinds = [];
    if (!stages.has("PANEL")) {
      settings.panelHorizontal = null;
      settings.panelVertical = null;
    }
  }
  if (!stages.has("VIDEO_KALIMAT")) settings.sentenceVideoKind = null;
  if (!stages.has("VIDEO_KALIMAT_H")) settings.sentenceVideoHKind = null;
  if (
    !outputs.includes("IMAGES_VIDEO") &&
    (stages.has("VIDEO_KALIMAT") || stages.has("VIDEO_KALIMAT_H"))
  )
    settings.sentenceKinds = [
      settings.sentenceVideoKind,
      settings.sentenceVideoHKind,
    ].filter((k): k is string => !!k);
  if (!stages.has("IMAGES_VIDEO")) settings.sentenceKinds = [];
  return {
    name,
    engine: input.engine as ContentType["engine"],
    outputs,
    settings,
  };
}

export function contentTypeUpdate(input: any, existing?: ContentType) {
  if (!existing || input?.settings !== undefined)
    return normalizeContentType(input);
  const next = normalizeContentType(input);
  const previous = existing.settings;
  if (!previous) return next;
  const merged = {
    ...previous,
    stockKinds: previous.stockKinds.length
      ? previous.stockKinds
      : next.settings.stockKinds,
    sentenceKinds: previous.sentenceKinds.length
      ? previous.sentenceKinds
      : next.settings.sentenceKinds,
    panelHorizontal: previous.panelHorizontal || next.settings.panelHorizontal,
    panelVertical: previous.panelVertical || next.settings.panelVertical,
    sentenceVideoKind:
      previous.sentenceVideoKind || next.settings.sentenceVideoKind,
    sentenceVideoHKind:
      previous.sentenceVideoHKind || next.settings.sentenceVideoHKind,
  };
  return normalizeContentType({ ...input, settings: merged });
}
