import { expect, it } from "vitest";
import { cronDistribution, wibDate } from "../src/client/cron-distribution";
import type { UpcomingCron } from "../src/server/cron-upcoming";
const cron = (changes: Partial<UpcomingCron> = {}): UpcomingCron => ({
  contentTypeId: 3,
  contentType: "Buku",
  kind: "ARTICLE",
  label: "Artikel",
  nextRun: null,
  batchSize: 1,
  cron: {
    book: "Buku",
    kind: "ARTICLE",
    enabled: true,
    intervalHours: 24,
    next_run: null,
    last_tick: null,
    last_result: null,
    schedule: {
      mode: "daily",
      times: ["09:00", "09:14", "09:15", "23:59"],
      days: [],
    },
  },
  ...changes,
});
it("groups scheduled executions into 15-minute buckets with correct boundaries", () => {
  const buckets = cronDistribution([cron()], "2026-10-11", 15);
  expect(buckets).toHaveLength(96);
  expect(buckets[36].count).toBe(2);
  expect(buckets[37].count).toBe(1);
  expect(buckets[95].count).toBe(1);
  expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(4);
});
it("respects weekly WIB weekdays, enabled state, stage availability and type filters", () => {
  const weekly = cron();
  weekly.cron!.schedule = { mode: "weekly", days: [1], times: ["09:00"] };
  const disabled = cron();
  disabled.cron!.enabled = false;
  const items = [
    weekly,
    disabled,
    cron({ available: false }),
    cron({ contentTypeId: 4 }),
  ];
  expect(
    cronDistribution(items, "2026-10-11", 15, "3").reduce(
      (n, b) => n + b.count,
      0,
    ),
  ).toBe(0);
  expect(
    cronDistribution(items, "2026-10-12", 30, "3").reduce(
      (n, b) => n + b.count,
      0,
    ),
  ).toBe(1);
});
it("projects legacy interval schedules from the next execution without inventing past runs", () => {
  const item = cron({ nextRun: Date.parse("2026-10-11T09:00:00+07:00") });
  item.cron!.schedule = null;
  item.cron!.intervalHours = 6;
  expect(
    cronDistribution([item], "2026-10-11", 60)
      .filter((b) => b.count)
      .map((b) => b.start),
  ).toEqual([540, 900, 1260]);
  expect(
    cronDistribution([item], "2026-10-10", 15).every((b) => b.count === 0),
  ).toBe(true);
});
it("uses WIB for default date and rejects invalid dates and bucket sizes", () => {
  expect(wibDate(new Date("2026-10-10T18:00:00Z"))).toBe("2026-10-11");
  expect(() => cronDistribution([], "2026-02-31", 15)).toThrow("tanggal");
  expect(() => cronDistribution([], "", 15)).toThrow("tanggal");
  expect(() => cronDistribution([], "2026-10-11", 7)).toThrow("Rentang");
});
