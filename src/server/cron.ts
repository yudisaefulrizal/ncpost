import { mediaUnits } from "./content-contract";
import type { Chapter } from "./store";
import { validateContentText } from "./domain";
import { panelSources, sentenceJob, type BookSettings } from "./book-settings";

export const CONTENT_CRON_KEY = "@content-type";
export const CRON_TYPES = [
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
  ["POST_IG", "Post IG"],
  ["REELS_IG", "Reels IG"],
] as const;
export type CronKind = (typeof CRON_TYPES)[number][0];
export interface BookCron<K extends string = CronKind> {
  book: string;
  kind: K;
  enabled: boolean;
  intervalHours: number;
  batchSize?: number;
  next_run: number | null;
  last_tick: number | null;
  last_result: string | null;
}
export const MAX_INTERVAL_HOURS = 8760;
export function validIntervalHours(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_INTERVAL_HOURS
  );
}
export function intervalDue(nextRun: number | null, now: number) {
  return nextRun != null && Number.isFinite(nextRun) && now >= nextRun;
}
type CronInput<K extends string> = Pick<
  BookCron<K>,
  "kind" | "enabled" | "intervalHours" | "batchSize"
>;
export function normalizeCron(input: any): CronInput<CronKind>;
export function normalizeCron<K extends string>(
  input: any,
  kinds: readonly K[],
): CronInput<K>;
export function normalizeCron(
  input: any,
  kinds: readonly string[] = CRON_TYPES.map(([k]) => k),
): CronInput<string> {
  if (!kinds.includes(input?.kind)) throw Error("Jenis cron tidak dikenal");
  if (typeof input.enabled !== "boolean")
    throw Error("Status cron tidak valid");
  if (!validIntervalHours(input.intervalHours))
    throw Error(
      `Interval harus berupa angka bulat 1–${MAX_INTERVAL_HOURS} jam`,
    );
  const batchSize = input.batchSize ?? 1;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100)
    throw Error("Jumlah konten harus 1–100");
  return {
    batchSize,
    kind: input.kind as string,
    enabled: input.enabled,
    intervalHours: input.intervalHours,
  };
}
// Only missing outputs, with prerequisites ready. Never regenerate or republish.
export function cronJobs(
  kind: CronKind,
  c: Chapter,
  s: BookSettings,
): string[] {
  const ready =
    c.article_status === "siap" &&
    validateContentText(c.article, c.content_engine, c.article_config).ok;
  const count = (k: string) => Number(c.stock_counts?.[k] ?? 0);
  const missing = (kinds: string[], n: number) =>
    kinds.filter((k) => count(k) < n);
  if (kind === "ARTICLE") return c.article ? [] : [kind];
  if (!ready) return [];
  const sentences = mediaUnits(
    c.article,
    s.imageUnit || "sentence",
    c.content_engine === "quote",
  ).length;
  switch (kind) {
    case "QUOTE":
      return c.quote ? [] : [kind];
    case "QUOTE_IMAGE":
      return c.quote && !c.quote_image ? [kind] : [];
    case "POST_IMAGE":
      return c.text_image ? [] : [kind];
    case "IMAGES_PANEL":
      return missing(
        s.stockKinds,
        mediaUnits(
          c.article,
          s.imageUnit || "paragraph",
          c.content_engine === "quote",
        ).length,
      );
    case "IMAGES_VIDEO":
      return missing(s.sentenceKinds.map(sentenceJob), sentences);
    case "TTS_KALIMAT":
      return c.sentence_audio ? [] : [kind];
    case "VIDEO_KALIMAT":
    case "VIDEO_KALIMAT_H": {
      const source =
        kind === "VIDEO_KALIMAT" ? s.sentenceVideoKind : s.sentenceVideoHKind;
      const output =
        kind === "VIDEO_KALIMAT" ? c.sentence_video : c.sentence_video_h;
      return !output &&
        c.sentence_audio &&
        source &&
        count(sentenceJob(source)) >= sentences
        ? [kind]
        : [];
    }
    case "PANEL":
      if (s.carouselMode === "direct") return c.panels ? [] : [kind];
      return !c.panels &&
        panelSources(s).length > 0 &&
        panelSources(s).every(
          (k) =>
            count(k) >=
            mediaUnits(
              c.article,
              s.imageUnit || "paragraph",
              c.content_engine === "quote",
            ).length,
        )
        ? [kind]
        : [];
    case "POST_IG":
      return c.panels &&
        c.panel_status === "tersedia" &&
        c.post_status === "belum"
        ? [kind]
        : [];
    case "REELS_IG":
      return c.sentence_video && c.reels_status === "belum" ? [kind] : [];
  }
}
