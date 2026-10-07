import type { Chapter } from "./store";
import { articleSentences, PANEL_COUNT, validateArticle } from "./domain";
import { panelSources, sentenceJob, type BookSettings } from "./book-settings";

export const CRON_TYPES = [
  ["ARTICLE", "Artikel"],
  ["QUOTE", "Quote"],
  ["QUOTE_IMAGE", "Gambar Quote"],
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
export interface BookCron {
  book: string;
  kind: CronKind;
  enabled: boolean;
  intervalHours: number;
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
export function normalizeCron(input: any) {
  if (!CRON_TYPES.some(([k]) => k === input?.kind))
    throw Error("Jenis cron tidak dikenal");
  if (typeof input.enabled !== "boolean")
    throw Error("Status cron tidak valid");
  if (!validIntervalHours(input.intervalHours))
    throw Error(
      `Interval harus berupa angka bulat 1–${MAX_INTERVAL_HOURS} jam`,
    );
  return {
    kind: input.kind as CronKind,
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
  const ready = c.article_status === "siap" && validateArticle(c.article).ok;
  const count = (k: string) => Number(c.stock_counts?.[k] ?? 0);
  const missing = (kinds: string[], n: number) =>
    kinds.filter((k) => count(k) < n);
  if (kind === "ARTICLE") return c.article ? [] : [kind];
  if (!ready) return [];
  const sentences = articleSentences(c.article).length;
  switch (kind) {
    case "QUOTE":
      return c.quote ? [] : [kind];
    case "QUOTE_IMAGE":
      return c.quote && !c.quote_image ? [kind] : [];
    case "IMAGES_PANEL":
      return missing(s.stockKinds, PANEL_COUNT);
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
      return !c.panels && panelSources(s).every((k) => count(k) >= PANEL_COUNT)
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
