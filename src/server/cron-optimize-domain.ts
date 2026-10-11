import type { UpcomingCron } from "./cron-upcoming";
import { normalizeSchedule, type CronSchedule } from "./cron-schedule";
import {
  normalizeCronGuide,
  timeMinutes,
  windowMinutes,
  type CronGuide,
  type GuideStage,
} from "./cron-guide-domain";

export interface OptimizedCron {
  source: string;
  item: UpcomingCron;
  schedule: CronSchedule;
  duration: number;
}
export interface CronOptimization {
  original: UpcomingCron[];
  entries: OptimizedCron[];
  items: UpcomingCron[];
  count: number;
  executions: number;
}
export const cronSource = (item: UpcomingCron) =>
  `${item.contentTypeId}:${item.kind}:${item.id}`;
export function cronStage(kind: string): { stage: GuideStage; rank: number } {
  if (["POST_IG", "REELS_IG", "POST_TIKTOK"].includes(kind))
    return { stage: "post", rank: 6 };
  if (kind === "ARTICLE") return { stage: "article", rank: 0 };
  if (kind === "QUOTE") return { stage: "article", rank: 1 };
  if (kind === "TTS_KALIMAT") return { stage: "audio", rank: 2 };
  if (kind === "PANEL") return { stage: "images", rank: 4 };
  if (["VIDEO_KALIMAT", "VIDEO_KALIMAT_H"].includes(kind))
    return { stage: "video", rank: 5 };
  if (
    ["QUOTE_IMAGE", "POST_IMAGE", "IMAGES_PANEL", "IMAGES_VIDEO"].includes(
      kind,
    ) ||
    kind.startsWith("IMAGE_") ||
    kind.startsWith("S_IMAGE_")
  )
    return { stage: "images", rank: 3 };
  throw Error(`Durasi untuk proses ${kind} belum tersedia di Guide`);
}
const WEEK = 10080;
const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
// Use a repeating week so Sunday/Monday and midnight collisions are included.
function segments(start: number, length: number): [number, number][] {
  const value = ((start % WEEK) + WEEK) % WEEK;
  return value + length <= WEEK
    ? [[value, value + length]]
    : [
        [value, WEEK],
        [0, value + length - WEEK],
      ];
}
// Reproducible randomness keeps apply identical to the preview.
function seededRandom(seed: string) {
  let state = 2166136261;
  for (const character of seed)
    state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
export function optimizeCrons(
  input: UpcomingCron[],
  rawGuide: CronGuide,
  seed?: string,
): CronOptimization {
  const guide = normalizeCronGuide(rawGuide);
  const active = input.filter(
    (item) => item.cron?.enabled && item.available !== false,
  );
  if (!active.length) throw Error("Tidak ada cronjob aktif untuk dioptimasi");
  for (const item of active) {
    if (!item.id || !item.cron?.schedule)
      throw Error(
        `Sunting jadwal lama ${item.contentType} · ${item.label} menjadi harian/mingguan sebelum optimasi`,
      );
    cronStage(item.kind);
  }
  const origin = timeMinutes(guide.production.start);
  const phase = (time: string) => (timeMinutes(time) - origin + 1440) % 1440;
  const firstPhase = (item: UpcomingCron) =>
    Math.min(...item.cron!.schedule!.times.map(phase));
  active.sort(
    (a, b) =>
      Number(cronStage(a.kind).stage === "post") -
        Number(cronStage(b.kind).stage === "post") ||
      a.contentTypeId - b.contentTypeId ||
      cronStage(a.kind).rank - cronStage(b.kind).rank ||
      a.kind.localeCompare(b.kind) ||
      firstPhase(a) - firstPhase(b) ||
      String(a.id).localeCompare(String(b.id)),
  );
  const production = [[0, windowMinutes(guide.production)]];
  const posting = Object.values(guide.posting)
    .map((window) => {
      const start = (timeMinutes(window.start) - origin + 1440) % 1440;
      return [start, start + windowMinutes(window)];
    })
    .sort((a, b) => a[0] - b[0]);
  const occupied: [number, number][] = [];
  const ready = new Map<number, number>();
  const postCounts = new Map<number, number[]>();
  const random = seededRandom(
    seed ??
      JSON.stringify({
        guide,
        schedules: active.map((item) => [
          cronSource(item),
          item.cron!.schedule,
        ]),
      }),
  );
  const entries: OptimizedCron[] = [];
  let executions = 0;
  for (const item of active) {
    const original = normalizeSchedule(item.cron!.schedule);
    const { stage } = cronStage(item.kind);
    const duration = guide.durations[stage];
    const reserved = duration + guide.gapMinutes;
    let earliest = ready.get(item.contentTypeId) || 0;
    for (const time of [...original.times].sort(
      (a, b) => phase(a) - phase(b),
    )) {
      // Calendar hours after midnight belong to the preceding production night.
      // This anchor keeps repeated optimization from drifting weekly days.
      const previousNight = timeMinutes(time) < origin ? 1 : 0;
      const days =
        original.mode === "daily"
          ? [0, 1, 2, 3, 4, 5, 6]
          : original.days.map((day) => (day - previousNight + 7) % 7);
      let chosen: number | undefined;
      let slot: [number, number][] = [];
      let chosenWindow = -1;
      const counts = postCounts.get(item.contentTypeId) || [0, 0, 0];
      const candidates: {
        minute: number;
        ranges: [number, number][];
        window: number;
        count: number;
        load: number;
        tie: number;
      }[] = [];
      const windows = stage === "post" ? posting : production;
      for (const [window, [start, end]] of windows.entries()) {
        for (
          let candidate = Math.max(start, earliest);
          candidate + duration <= end;
          candidate++
        ) {
          const ranges = days.flatMap((day) =>
            segments(day * 1440 + origin + candidate, reserved),
          );
          const selfOverlap = ranges.some((range, i) =>
            ranges
              .slice(i + 1)
              .some((other) => range[0] < other[1] && other[0] < range[1]),
          );
          if (
            !selfOverlap &&
            !ranges.some(([a, b]) => occupied.some(([c, d]) => a < d && c < b))
          ) {
            if (stage === "post") {
              const effectiveStart = Math.max(start, earliest);
              const windowRanges = days.flatMap((day) =>
                segments(
                  day * 1440 + origin + effectiveStart,
                  end - effectiveStart,
                ),
              );
              const used = windowRanges.reduce(
                (sum, [a, b]) =>
                  sum +
                  occupied.reduce(
                    (subtotal, [c, d]) =>
                      subtotal + Math.max(0, Math.min(b, d) - Math.max(a, c)),
                    0,
                  ),
                0,
              );
              candidates.push({
                minute: candidate,
                ranges,
                window,
                count: counts[window],
                load: used / ((end - effectiveStart) * days.length),
                tie: random(),
              });
            } else {
              chosen = candidate;
              slot = ranges;
            }
            break;
          }
        }
        if (chosen !== undefined) break;
      }
      if (stage === "post" && candidates.length) {
        candidates.sort(
          (a, b) => a.count - b.count || a.load - b.load || a.tie - b.tie,
        );
        const preferred = candidates[0];
        chosen = preferred.minute;
        slot = preferred.ranges;
        chosenWindow = preferred.window;
      }
      if (chosen === undefined)
        throw Error(
          `Slot ${stage === "post" ? "posting" : "produksi"} penuh untuk ${item.contentType} · ${item.label}. Perluas rentang di Guide atau kurangi frekuensi cronjob. Jadwal belum diubah.`,
        );
      occupied.push(...slot);
      const absolute = origin + chosen;
      const dayOffset = Math.floor(absolute / 1440);
      const schedule: CronSchedule = {
        mode: original.mode,
        days:
          original.mode === "weekly"
            ? days.map((day) => (day + dayOffset) % 7).sort()
            : [],
        times: [clock(absolute % 1440)],
      };
      const source = cronSource(item);
      const existing = entries.find(
        (entry) =>
          entry.source === source &&
          JSON.stringify(entry.schedule.days) === JSON.stringify(schedule.days),
      );
      if (existing) existing.schedule.times.push(schedule.times[0]);
      else entries.push({ source, item, schedule, duration });
      if (stage === "post") {
        counts[chosenWindow] += days.length;
        postCounts.set(item.contentTypeId, counts);
      } else {
        earliest = chosen + reserved;
        ready.set(item.contentTypeId, earliest);
      }
      executions += days.length;
    }
  }
  const replaced = new Set(active.map(cronSource));
  const items = input.filter((item) => !replaced.has(cronSource(item)));
  for (const [index, entry] of entries.entries()) {
    entry.schedule = normalizeSchedule(entry.schedule);
    items.push({
      ...entry.item,
      id: `${entry.item.id}-preview-${index}`,
      nextRun: null,
      cron: { ...entry.item.cron!, schedule: entry.schedule, next_run: null },
    });
  }
  return { original: input, entries, items, count: active.length, executions };
}
