export const GUIDE_STAGES = [
  ["article", "Artikel"],
  ["audio", "Audio"],
  ["images", "Gambar · seluruh panel"],
  ["video", "Generate video"],
  ["post", "Posting · seluruh target sosmed"],
] as const;
export type GuideStage = (typeof GUIDE_STAGES)[number][0];
export interface TimeWindow {
  start: string;
  end: string;
}
export interface CronGuide {
  durations: Record<GuideStage, number>;
  production: TimeWindow;
  posting: { morning: TimeWindow; noon: TimeWindow; evening: TimeWindow };
  gapMinutes: number;
}
export const DEFAULT_CRON_GUIDE: CronGuide = {
  durations: { article: 10, audio: 10, images: 20, video: 10, post: 10 },
  production: { start: "21:00", end: "05:00" },
  posting: {
    morning: { start: "06:00", end: "08:00" },
    noon: { start: "11:00", end: "13:00" },
    evening: { start: "16:00", end: "20:00" },
  },
  gapMinutes: 0,
};
export function timeMinutes(time: string) {
  if (typeof time !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw Error("Pilih jam yang valid");
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function windowMinutes(window: TimeWindow) {
  return (timeMinutes(window.end) - timeMinutes(window.start) + 1440) % 1440;
}
function normalizeWindow(
  input: any,
  label: string,
  overnight = false,
): TimeWindow {
  const start = timeMinutes(input?.start),
    end = timeMinutes(input?.end);
  if (start === end || (!overnight && end < start))
    throw Error(`Rentang ${label} tidak valid`);
  return { start: input.start, end: input.end };
}
export function normalizeCronGuide(input: any): CronGuide {
  const durations = {} as CronGuide["durations"];
  for (const [stage, label] of GUIDE_STAGES) {
    const value = input?.durations?.[stage];
    if (!Number.isInteger(value) || value < 1 || value > 1440)
      throw Error(`Durasi ${label} harus 1–1440 menit`);
    durations[stage] = value;
  }
  if (
    !Number.isInteger(input?.gapMinutes) ||
    input.gapMinutes < 0 ||
    input.gapMinutes > 1439
  )
    throw Error("Jeda antarproses harus 0–1439 menit");
  const production = normalizeWindow(input?.production, "produksi", true);
  const posting = {
    morning: normalizeWindow(input?.posting?.morning, "posting pagi"),
    noon: normalizeWindow(input?.posting?.noon, "posting siang"),
    evening: normalizeWindow(input?.posting?.evening, "posting sore"),
  };
  const ranges = Object.values(posting).sort(
    (a, b) => timeMinutes(a.start) - timeMinutes(b.start),
  );
  for (let i = 1; i < ranges.length; i++)
    if (timeMinutes(ranges[i].start) < timeMinutes(ranges[i - 1].end))
      throw Error("Rentang posting tidak boleh saling bertumpuk");
  return { durations, production, posting, gapMinutes: input.gapMinutes };
}
