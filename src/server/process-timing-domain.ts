export const TIMING_STAGES = [
  ["article", "Artikel"],
  ["images", "Gambar · seluruh panel"],
  ["video", "Video"],
  ["audio", "Audio"],
] as const;
export type TimingStage = (typeof TIMING_STAGES)[number][0];
export interface ProcessTiming {
  id: number;
  stage: TimingStage;
  source: string;
  job_id: number;
  attempt: number;
  kind: string;
  content_type_id: number | null;
  title: string;
  status: "completed" | "failed";
  started_at: number;
  finished_at: number;
  duration_ms: number;
}
export function timingStage(kind: string): TimingStage | null {
  if (kind === "ARTICLE") return "article";
  if (kind === "TTS_KALIMAT") return "audio";
  if (["VIDEO_KALIMAT", "VIDEO_KALIMAT_H"].includes(kind)) return "video";
  if (
    ["POST_IMAGE", "QUOTE_IMAGE"].includes(kind) ||
    kind.startsWith("IMAGE_") ||
    kind.startsWith("S_IMAGE_")
  )
    return "images";
  return null;
}
export function timingEta(rows: ProcessTiming[]) {
  return TIMING_STAGES.map(([stage, label]) => {
    const samples = rows
      .filter((row) => row.stage === stage && row.status === "completed")
      .map((row) => Number(row.duration_ms))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b);
    const p90 = samples.length
      ? samples[Math.ceil(samples.length * 0.9) - 1]
      : null;
    return {
      stage,
      label,
      samples: samples.length,
      p90Ms: p90,
      minutes: p90 === null ? null : Math.max(1, Math.ceil(p90 / 60000)),
    };
  });
}
