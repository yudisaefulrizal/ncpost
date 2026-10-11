export interface CronSchedule {
  mode: "daily" | "weekly";
  times: string[];
  days: number[];
}
export const CRON_DAYS = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];
export function normalizeSchedule(input: unknown): CronSchedule {
  const v = input as Partial<CronSchedule> | null;
  if (!v || !["daily", "weekly"].includes(v.mode || ""))
    throw Error("Pilih jadwal harian atau mingguan");
  if (
    !Array.isArray(v.times) ||
    !v.times.length ||
    v.times.length > 48 ||
    v.times.some(
      (t) => typeof t !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t),
    )
  )
    throw Error("Pilih jam yang valid, maksimal 48 jam eksekusi");
  const days = v.mode === "weekly" ? v.days : [];
  if (
    !Array.isArray(days) ||
    (v.mode === "weekly" && !days.length) ||
    days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
  )
    throw Error("Pilih hari untuk jadwal mingguan");
  return {
    mode: v.mode as CronSchedule["mode"],
    times: [...new Set(v.times)].sort(),
    days: [...new Set(days)].sort(),
  };
}
export function nextScheduleRun(schedule: CronSchedule, now: number): number {
  const v = normalizeSchedule(schedule);
  const shifted = new Date(now + 7 * 3600000);
  const midnight =
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    ) -
    7 * 3600000;
  for (let offset = 0; offset <= 7; offset++) {
    const day = (shifted.getUTCDay() + offset) % 7;
    if (v.mode === "weekly" && !v.days.includes(day)) continue;
    for (const time of v.times) {
      const [hour, minute] = time.split(":").map(Number);
      const candidate =
        midnight + offset * 86400000 + hour * 3600000 + minute * 60000;
      if (candidate > now) return candidate;
    }
  }
  throw Error("Waktu cronjob berikutnya tidak ditemukan");
}
export function cronNextRun(
  cron: {
    schedule?: CronSchedule | null;
    schedule_json?: string | null;
    intervalHours?: number;
    interval_hours?: number;
  },
  now: number,
) {
  const schedule =
    cron.schedule ??
    (cron.schedule_json ? JSON.parse(cron.schedule_json) : null);
  return schedule
    ? nextScheduleRun(schedule, now)
    : now + Number(cron.intervalHours ?? cron.interval_hours ?? 24) * 3600000;
}
export function scheduleLabel(
  schedule?: CronSchedule | null,
  intervalHours = 24,
) {
  if (!schedule) return `Setiap ${intervalHours} jam (jadwal lama)`;
  return `${schedule.mode === "daily" ? "Harian" : schedule.days.map((d) => CRON_DAYS[d]).join(", ")} · ${schedule.times.join(", ")} WIB`;
}
