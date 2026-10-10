import {
  contentStages,
  isFinalOutput,
  type ContentType,
} from "./content-type-domain";
import { cronJobs, type CronKind } from "./cron";
import { validateContentText } from "./domain";
import type { Chapter } from "./store";
import type { BookSettings } from "./book-settings";
import {
  newsKinds,
  newsPrerequisite,
  newsStageDone,
  type NewsProductionData,
} from "./news-production-domain";

const ORDER: CronKind[] = [
  "ARTICLE",
  "POST_IMAGE",
  "IMAGES_PANEL",
  "IMAGES_VIDEO",
  "TTS_KALIMAT",
  "PANEL",
  "VIDEO_KALIMAT",
  "VIDEO_KALIMAT_H",
];
type Attempt = { kind: string; state: string };
// A failed stage waits for explicit retry. Finished prerequisites are reused.
export function nextBookJob(
  type: ContentType,
  chapter: Chapter,
  settings: BookSettings,
  attempts: Attempt[],
) {
  if (attempts.some((j) => ["queued", "running"].includes(j.state)))
    return null;
  const results: Record<string, unknown> = {
    POST_IMAGE: chapter.text_image,
    PANEL: chapter.panels,
    VIDEO_KALIMAT: chapter.sentence_video,
    VIDEO_KALIMAT_H: chapter.sentence_video_h,
  };
  const pending = type.outputs.filter(
    (key) => !isFinalOutput(key) || !results[key],
  );
  if (!pending.length) return null;
  const stages = contentStages({ outputs: pending, settings });
  const candidates =
    chapter.article && chapter.article_status !== "siap"
      ? chapter.article_status === "menunggu editor" &&
        validateContentText(
          chapter.article,
          type.engine,
          type.settings?.articleConfig,
        ).ok
        ? ["EDITOR"]
        : []
      : ORDER.filter((k) => stages.has(k)).flatMap((k) =>
          cronJobs(k, chapter, settings),
        );
  return (
    candidates.find((kind) => {
      const latest = attempts.find((j) => j.kind === kind);
      return !latest || latest.state !== "failed";
    }) ?? null
  );
}
export function nextNewsJob(
  type: ContentType,
  article: string,
  settings: BookSettings,
  production: NewsProductionData,
) {
  if (production.jobs.some((j) => ["queued", "running"].includes(j.state)))
    return null;
  const pending = type.outputs.filter(
    (key) => !isFinalOutput(key) || !production.outputs[key],
  );
  if (!pending.length) return null;
  const stages = contentStages({ outputs: pending, settings });
  for (const stage of ORDER.filter((k) => k !== "ARTICLE" && stages.has(k))) {
    if (newsStageDone(stage, production, settings, article)) continue;
    for (const kind of newsKinds(stage, settings)) {
      if (newsStageDone(kind, production, settings, article)) continue;
      // Individual stock lanes use the aggregate stage count.
      if (stage === "IMAGES_PANEL" || stage === "IMAGES_VIDEO") {
        const laneSettings =
          stage === "IMAGES_PANEL"
            ? { ...settings, stockKinds: [kind] }
            : { ...settings, sentenceKinds: [kind.slice(2)] };
        if (newsStageDone(stage, production, laneSettings, article)) continue;
      }
      const latest = production.jobs.find((j) => j.kind === kind);
      if (latest && latest.state === "failed") continue;
      if (!newsPrerequisite(kind, production, settings, article)) return kind;
    }
  }
  return null;
}
