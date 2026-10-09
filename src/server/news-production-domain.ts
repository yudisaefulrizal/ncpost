import {
  type BookSettings,
  STOCK_KINDS,
  sentenceJob,
  isStockKind,
  baseKind,
} from "./book-settings";
export const NEWS_MEDIA_STAGES = [
  ["POST_IMAGE", "Gambar per seluruh teks"],
  ["IMAGES_PANEL", "Gambar Panel"],
  ["IMAGES_VIDEO", "Gambar Video"],
  ["TTS_KALIMAT", "Audio"],
  ["VIDEO_KALIMAT", "Video V"],
  ["VIDEO_KALIMAT_H", "Video H"],
  ["PANEL", "Panel"],
  ["POST_IG", "Post IG"],
  ["REELS_IG", "Reels IG"],
] as const;
export const NEWS_CRON_TYPES = [
  ["ARTICLE", "Artikel"],
  ...NEWS_MEDIA_STAGES,
] as const;
export type NewsCronKind = (typeof NEWS_CRON_TYPES)[number][0];
export const NEWS_MEDIA_KINDS = [
  "POST_IMAGE",
  ...STOCK_KINDS,
  ...STOCK_KINDS.map(sentenceJob),
  "TTS_KALIMAT",
  "VIDEO_KALIMAT",
  "VIDEO_KALIMAT_H",
  "PANEL",
  "POST_IG",
  "REELS_IG",
];
export interface NewsMediaJob {
  id: number;
  news_id: number;
  revision: number;
  kind: string;
  state: string;
  attempts: number;
  lease: number;
  force_new: number;
  settings: string;
  error: string | null;
}
export interface NewsStock {
  kind: string;
  panel: number;
  asset_id: number;
  file: string;
  description: string;
}
export interface NewsProductionData {
  outputs: Record<string, any>;
  jobs: NewsMediaJob[];
  stock: NewsStock[];
}
export const emptyNewsProduction = (): NewsProductionData => ({
  outputs: {},
  jobs: [],
  stock: [],
});
export function newsSentences(paragraph: string) {
  return paragraph
    .replace(/[*_`]/g, "")
    .trim()
    .split(/(?<=[.!?])\s+|(?<=[.!?]["'”’)])\s+/)
    .filter(Boolean);
}
export function newsContent(article: string) {
  const lines = article.replace(/\r\n/g, "\n").trim().split("\n");
  const title = (lines.shift() ?? "").replace(/^#+\s*/, "");
  const source = lines.indexOf("Sumber:");
  const paragraphs = lines
    .slice(0, source < 0 ? lines.length : source)
    .filter((l) => !/^## /.test(l))
    .join("\n")
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean);
  const tags = (lines.find((l) => l.startsWith("Tag:")) ?? "")
    .slice(4)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const sentences = paragraphs.flatMap((p, i) =>
    newsSentences(p).map((text) => ({ text, paragraph: i + 1 })),
  );
  return { title, paragraphs, tags, sentences };
}
export function newsKinds(stage: string, s: BookSettings) {
  if (stage === "IMAGES_PANEL") return s.stockKinds;
  if (stage === "IMAGES_VIDEO") return s.sentenceKinds.map(sentenceJob);
  return [stage];
}
export function newsPostImagePrompt(article: string) {
  return (
    "buat menjadi infografis\n\n" + newsContent(article).paragraphs.join("\n\n")
  );
}
export function newsPrerequisite(
  kind: string,
  p: NewsProductionData,
  s: BookSettings,
  article: string,
): string | null {
  const content = newsContent(article);
  const enough = (k: string, n: number) =>
    p.stock.filter((b) => b.kind === k).length >= n;
  if (
    isStockKind(baseKind(kind)) ||
    kind === "TTS_KALIMAT" ||
    kind === "POST_IMAGE"
  )
    return null;
  if (kind === "PANEL")
    return (s.panelHorizontal || s.panelVertical) &&
      [s.panelHorizontal, s.panelVertical]
        .filter(Boolean)
        .every((k) => enough(k!, 4))
      ? null
      : "Lengkapi gambar sumber panel";
  if (kind === "VIDEO_KALIMAT" || kind === "VIDEO_KALIMAT_H") {
    const source =
      kind === "VIDEO_KALIMAT" ? s.sentenceVideoKind : s.sentenceVideoHKind;
    if (!source) return "Pilih sumber gambar video di Pengaturan Konten";
    if (!p.outputs.TTS_KALIMAT) return "Buat audio terlebih dahulu";
    return enough(sentenceJob(source), content.sentences.length)
      ? null
      : "Lengkapi gambar per kalimat";
  }
  if (kind === "POST_IG")
    return newsStageDone("PANEL", p, s, article)
      ? null
      : "Render panel terlebih dahulu";
  if (kind === "REELS_IG")
    return newsStageDone("VIDEO_KALIMAT", p, s, article)
      ? null
      : "Render Video V terlebih dahulu";
  return "Jenis produksi berita tidak dikenal";
}
export function newsStageDone(
  stage: string,
  p: NewsProductionData,
  s: BookSettings,
  article: string,
) {
  if (stage === "IMAGES_PANEL" || stage === "IMAGES_VIDEO") {
    const kinds = newsKinds(stage, s);
    const total =
      stage === "IMAGES_PANEL" ? 4 : newsContent(article).sentences.length;
    return (
      kinds.length > 0 &&
      total > 0 &&
      kinds.every((k) => p.stock.filter((b) => b.kind === k).length >= total)
    );
  }
  if (stage === "POST_IG" || stage === "REELS_IG")
    return p.outputs[stage]?.status === "published";
  if (stage === "PANEL")
    return (
      !!p.outputs.PANEL &&
      p.outputs.PANEL.sources?.panelHorizontal === s.panelHorizontal &&
      p.outputs.PANEL.sources?.panelVertical === s.panelVertical
    );
  if (stage === "VIDEO_KALIMAT" || stage === "VIDEO_KALIMAT_H")
    return (
      !!p.outputs[stage] &&
      p.outputs[stage].source ===
        (stage === "VIDEO_KALIMAT" ? s.sentenceVideoKind : s.sentenceVideoHKind)
    );
  return !!p.outputs[stage];
}
export function newsCaption(article: string) {
  const c = newsContent(article);
  const source = /^1\. \[[^\]]+\]\((https:\/\/[^\s)]+)\)$/m.exec(article)?.[1];
  const tags = [
    ...new Set(
      ["berita", ...c.tags].map(
        (t) => "#" + t.replace(/^#/, "").replace(/[^\p{L}\p{N}_]/gu, ""),
      ),
    ),
  ];
  const caption = [
    c.title,
    ...c.paragraphs,
    source ? `Sumber: ${source}` : "",
    tags.join(" "),
  ]
    .filter(Boolean)
    .join("\n\n");
  if (caption.length > 2200)
    throw Error("Caption berita melebihi 2.200 karakter");
  return caption;
}
