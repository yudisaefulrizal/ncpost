import type { UpcomingCron } from "../server/cron-upcoming";
export interface CronBucket {
  start: number;
  count: number;
  labels: string[];
}
export function wibDate(now = new Date()): string {
  return new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
}
export function cronDistribution(
  items: UpcomingCron[],
  date: string,
  interval: number,
  typeId = "",
): CronBucket[] {
  if (![5, 15, 30, 60].includes(interval))
    throw Error("Rentang waktu tidak valid");
  const midnight = Date.parse(`${date}T00:00:00+07:00`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(midnight) ||
    wibDate(new Date(midnight)) !== date
  )
    throw Error("Pilih tanggal yang valid");
  const day = new Date(midnight + 7 * 3600000).getUTCDay();
  const buckets: CronBucket[] = Array.from(
    { length: 1440 / interval },
    (_, i) => ({ start: i * interval, count: 0, labels: [] }),
  );
  const add = (minute: number, item: UpcomingCron) => {
    const bucket = buckets[Math.floor(minute / interval)];
    bucket.count++;
    bucket.labels.push(
      `${item.contentType} · ${item.label} · ${minuteLabel(minute)}`,
    );
  };
  for (const item of items) {
    if (
      !item.cron?.enabled ||
      item.available === false ||
      (typeId && String(item.contentTypeId) !== typeId)
    )
      continue;
    const schedule = item.cron.schedule;
    if (schedule) {
      if (schedule.mode === "weekly" && !schedule.days.includes(day)) continue;
      for (const time of new Set(schedule.times)) {
        if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) continue;
        const [h, m] = time.split(":").map(Number);
        add(h * 60 + m, item);
      }
    } else {
      const step = item.cron.intervalHours * 3600000;
      if (!item.nextRun || !Number.isFinite(step) || step < 3600000) continue;
      const first =
        item.nextRun +
        Math.max(0, Math.ceil((midnight - item.nextRun) / step)) * step;
      for (let time = first; time < midnight + 86400000; time += step)
        add(Math.floor((time - midnight) / 60000), item);
    }
  }
  return buckets;
}
export function minuteLabel(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}
