import { expect, it } from "vitest";
import {
  duplicateCron,
  shiftCronTimes,
  generateCronTimes,
} from "../src/client/cron-form";
it("shifts every time forward and backward across midnight", () => {
  expect(shiftCronTimes(["09:00", "23:50"], 20)).toEqual(["09:20", "00:10"]);
  expect(shiftCronTimes(["00:05", "12:00"], -10)).toEqual(["23:55", "11:50"]);
});
it("rejects incomplete times and invalid minute offsets", () => {
  expect(() => shiftCronTimes([""], 10)).toThrow("Lengkapi");
  for (const offset of [NaN, 1.5, 1440])
    expect(() => shiftCronTimes(["09:00"], offset)).toThrow("menit");
});
it("duplicates settings without copying identity or execution history", () => {
  const original = {
    id: "old",
    book: "Konten",
    kind: "ARTICLE",
    enabled: true,
    intervalHours: 24,
    schedule: { mode: "weekly" as const, times: ["09:00"], days: [1, 3] },
    next_run: 10,
    last_tick: 5,
    last_result: "Selesai",
  };
  const copy = duplicateCron(original);
  expect(copy).toMatchObject({
    id: undefined,
    enabled: true,
    next_run: null,
    last_tick: null,
    last_result: null,
  });
  copy.schedule!.times.push("12:00");
  copy.schedule!.days.push(4);
  expect(original.schedule.times).toEqual(["09:00"]);
  expect(original.schedule.days).toEqual([1, 3]);
});

it("generates regularly spaced times and handles midnight without changing count", () => {
  expect(generateCronTimes("09:15", 30, 4)).toEqual([
    "09:15",
    "09:45",
    "10:15",
    "10:45",
  ]);
  expect(generateCronTimes("23:30", 45, 3)).toEqual([
    "23:30",
    "00:15",
    "01:00",
  ]);
  expect(generateCronTimes("08:00", 30, 48)).toHaveLength(48);
});
it("rejects invalid starts, intervals, counts, and ranges covering a full day", () => {
  expect(() => generateCronTimes("", 10, 3)).toThrow("jam awal");
  expect(() => generateCronTimes("09:00", 0, 3)).toThrow("Jarak");
  expect(() => generateCronTimes("09:00", 1.5, 3)).toThrow("Jarak");
  expect(() => generateCronTimes("09:00", 10, 49)).toThrow("Jumlah");
  expect(() => generateCronTimes("09:00", 60, 25)).toThrow("24 jam");
});
