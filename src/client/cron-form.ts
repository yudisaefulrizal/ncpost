import type { BookCron } from "../server/cron";
export function duplicateCron<K extends string>(
  cron: BookCron<K>,
): BookCron<K> {
  return {
    ...cron,
    id: undefined,
    next_run: null,
    last_tick: null,
    last_result: null,
    schedule: cron.schedule
      ? {
          ...cron.schedule,
          times: [...cron.schedule.times],
          days: [...cron.schedule.days],
        }
      : null,
  };
}
export function shiftCronTimes(times: string[], minutes: number): string[] {
  if (!Number.isInteger(minutes) || Math.abs(minutes) > 1439)
    throw Error("Isi pergeseran menit antara -1439 dan 1439");
  return times.map((time) => {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
      throw Error("Lengkapi semua jam terlebih dahulu");
    const [hour, minute] = time.split(":").map(Number);
    const shifted = (((hour * 60 + minute + minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(shifted / 60)).padStart(2, "0")}:${String(shifted % 60).padStart(2, "0")}`;
  });
}
export function generateCronTimes(
  start: string,
  interval: number,
  count: number,
): string[] {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(start))
    throw Error("Pilih jam awal yang valid");
  if (!Number.isInteger(interval) || interval < 1 || interval > 1439)
    throw Error("Jarak antarjam harus 1–1439 menit");
  if (!Number.isInteger(count) || count < 1 || count > 48)
    throw Error("Jumlah jam harus 1–48");
  if (interval * (count - 1) >= 1440)
    throw Error("Rentang seluruh jam harus kurang dari 24 jam");
  return Array.from(
    { length: count },
    (_, index) => shiftCronTimes([start], (interval * index) % 1440)[0],
  );
}
