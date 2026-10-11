import { expect, it, vi } from "vitest";
import {
  DEFAULT_CRON_GUIDE,
  normalizeCronGuide,
  windowMinutes,
} from "../src/server/cron-guide-domain";
import { loadCronGuide, saveCronGuide } from "../src/server/cron-guide-store";

it("keeps the agreed durations and WIB windows including overnight production", () => {
  const guide = normalizeCronGuide(DEFAULT_CRON_GUIDE);
  expect(guide.durations).toEqual({
    article: 10,
    audio: 10,
    images: 20,
    video: 10,
    post: 10,
  });
  expect(windowMinutes(guide.production)).toBe(480);
  expect(guide.posting.evening).toEqual({ start: "16:00", end: "20:00" });
  guide.production.start = "22:00";
  expect(DEFAULT_CRON_GUIDE.production.start).toBe("21:00");
});
it("rejects invalid durations, times, gaps and overlapping posting windows", () => {
  for (const value of [0, -1, 1.5, 1441, "10", NaN])
    expect(() =>
      normalizeCronGuide({
        ...DEFAULT_CRON_GUIDE,
        durations: { ...DEFAULT_CRON_GUIDE.durations, article: value },
      }),
    ).toThrow("Durasi");
  expect(() =>
    normalizeCronGuide({
      ...DEFAULT_CRON_GUIDE,
      production: { start: "25:00", end: "05:00" },
    }),
  ).toThrow();
  expect(() =>
    normalizeCronGuide({
      ...DEFAULT_CRON_GUIDE,
      production: { start: "05:00", end: "05:00" },
    }),
  ).toThrow();
  expect(() =>
    normalizeCronGuide({ ...DEFAULT_CRON_GUIDE, gapMinutes: -1 }),
  ).toThrow("Jeda");
  expect(() =>
    normalizeCronGuide({
      ...DEFAULT_CRON_GUIDE,
      posting: {
        ...DEFAULT_CRON_GUIDE.posting,
        noon: { start: "07:00", end: "13:00" },
      },
    }),
  ).toThrow("bertumpuk");
});
it("loads defaults without a saved row and saves validated global settings", async () => {
  const query = vi.fn(async () => [[]]);
  const db = { query } as any;
  expect(await loadCronGuide(db)).toEqual(DEFAULT_CRON_GUIDE);
  await saveCronGuide(db, { ...DEFAULT_CRON_GUIDE, gapMinutes: 5 });
  const [sql, params] = query.mock.calls[1] as any;
  expect(sql).toContain("ON DUPLICATE KEY UPDATE");
  expect(JSON.parse(params[0]).gapMinutes).toBe(5);
  await expect(saveCronGuide(db, {})).rejects.toThrow();
  expect(query).toHaveBeenCalledTimes(2);
});
