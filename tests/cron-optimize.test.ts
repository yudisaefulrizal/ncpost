import { expect, it } from "vitest";
import { optimizeCrons } from "../src/server/cron-optimize-domain";
import {
  DEFAULT_CRON_GUIDE,
  timeMinutes,
} from "../src/server/cron-guide-domain";
import type { UpcomingCron } from "../src/server/cron-upcoming";

function cron(
  type: number,
  kind: string,
  times = ["09:00"],
  days?: number[],
): UpcomingCron {
  return {
    id: `${type}-${kind}`,
    contentTypeId: type,
    contentType: `Type ${type}`,
    kind,
    label: kind,
    batchSize: 1,
    nextRun: null,
    engine: "book",
    available: true,
    cron: {
      id: `${type}-${kind}`,
      book: "",
      kind,
      enabled: true,
      intervalHours: 24,
      next_run: null,
      last_tick: null,
      last_result: null,
      schedule: { mode: days ? "weekly" : "daily", times, days: days || [] },
    },
  };
}
it("serializes all content types globally, respects dependencies, and schedules posting in ideal windows", () => {
  const input = [
    cron(2, "POST_IG"),
    cron(1, "VIDEO_KALIMAT"),
    cron(1, "IMAGES_VIDEO"),
    cron(1, "TTS_KALIMAT"),
    cron(1, "ARTICLE"),
    cron(1, "REELS_IG"),
    cron(2, "ARTICLE"),
  ];
  const plan = optimizeCrons(input, DEFAULT_CRON_GUIDE);
  expect(
    plan.entries
      .filter((e) => !["POST_IG", "REELS_IG"].includes(e.item.kind))
      .map((e) => e.schedule.times[0]),
  ).toEqual(["21:00", "21:10", "21:20", "21:40", "21:50"]);
  const posts = plan.entries.filter((e) =>
    ["POST_IG", "REELS_IG"].includes(e.item.kind),
  );
  expect(new Set(posts.map((e) => e.schedule.times[0])).size).toBe(2);
  for (const post of posts)
    expect(["06:00", "11:00", "16:00"]).toContain(post.schedule.times[0]);
  expect(plan.count).toBe(7);
  expect(plan.executions).toBe(49);
  expect(input[0].cron!.schedule!.times).toEqual(["09:00"]);
});
function postingCounts(plan: ReturnType<typeof optimizeCrons>, type = 1) {
  const counts = [0, 0, 0];
  for (const entry of plan.entries.filter(
    (e) =>
      e.item.contentTypeId === type &&
      ["POST_IG", "REELS_IG", "POST_TIKTOK"].includes(e.item.kind),
  ))
    for (const time of entry.schedule.times) {
      const minute = timeMinutes(time);
      counts[minute < 11 * 60 ? 0 : minute < 16 * 60 ? 1 : 2]++;
    }
  return counts;
}
it("balances three, four and six posting executions per content type across all windows", () => {
  for (const count of [3, 4, 6]) {
    const times = Array.from(
      { length: count },
      (_, i) => `09:${String(i).padStart(2, "0")}`,
    );
    const plan = optimizeCrons(
      [cron(1, "POST_IG", times)],
      DEFAULT_CRON_GUIDE,
      "balance",
    );
    const counts = postingCounts(plan);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(count);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(counts.every((value) => value > 0)).toBe(true);
  }
});
it("puts two posts into different windows even when the first random choice is evening", () => {
  for (let seed = 0; seed < 20; seed++) {
    const plan = optimizeCrons(
      [cron(1, "POST_IG"), cron(1, "POST_TIKTOK")],
      DEFAULT_CRON_GUIDE,
      String(seed),
    );
    expect(postingCounts(plan).filter(Boolean)).toHaveLength(2);
  }
});
it("randomizes equivalent single-post choices reproducibly for preview and apply", () => {
  const input = [cron(1, "POST_IG")];
  const choices = new Set<string>();
  for (let seed = 0; seed < 20; seed++) {
    const first = optimizeCrons(input, DEFAULT_CRON_GUIDE, String(seed));
    const again = optimizeCrons(input, DEFAULT_CRON_GUIDE, String(seed));
    expect(again.entries.map((e) => e.schedule)).toEqual(
      first.entries.map((e) => e.schedule),
    );
    choices.add(first.entries[0].schedule.times[0]);
  }
  expect(choices.size).toBe(3);
});
it("uses less occupied global windows for single posts of other content types", () => {
  const plan = optimizeCrons(
    [cron(1, "POST_IG"), cron(2, "POST_IG"), cron(3, "POST_IG")],
    DEFAULT_CRON_GUIDE,
    "global",
  );
  expect(new Set(plan.entries.map((e) => e.schedule.times[0])).size).toBe(3);
});
it("falls back to available windows when other windows cannot fit a full posting slot", () => {
  const guide = {
    ...DEFAULT_CRON_GUIDE,
    posting: {
      morning: { start: "06:00", end: "06:05" },
      noon: { start: "11:00", end: "11:05" },
      evening: { start: "16:00", end: "16:40" },
    },
  };
  const plan = optimizeCrons(
    [cron(1, "POST_IG", ["09:00", "10:00", "11:00"])],
    guide,
    "fallback",
  );
  expect(plan.entries[0].schedule.times).toEqual(["16:00", "16:10", "16:20"]);
});
it("uses tuned durations and gap for every global slot", () => {
  const guide = {
    ...DEFAULT_CRON_GUIDE,
    gapMinutes: 5,
    durations: { ...DEFAULT_CRON_GUIDE.durations, article: 15 },
  };
  const plan = optimizeCrons(
    [cron(1, "ARTICLE"), cron(2, "ARTICLE"), cron(3, "ARTICLE")],
    guide,
  );
  expect(plan.entries.map((e) => e.schedule.times[0])).toEqual([
    "21:00",
    "21:20",
    "21:40",
  ]);
});
it("moves weekly day groups across midnight without adding or losing executions", () => {
  const guide = {
    ...DEFAULT_CRON_GUIDE,
    production: { start: "23:50", end: "05:00" },
  };
  const input = [cron(1, "ARTICLE", ["09:00", "10:00"], [6])];
  const plan = optimizeCrons(input, guide);
  expect(
    plan.entries.map((e) => ({
      days: e.schedule.days,
      times: e.schedule.times,
    })),
  ).toEqual([
    { days: [5], times: ["23:50"] },
    { days: [6], times: ["00:00"] },
  ]);
  expect(plan.executions).toBe(2);
});
it("does not collide over the cyclic Sunday/Monday boundary", () => {
  const guide = {
    ...DEFAULT_CRON_GUIDE,
    production: { start: "23:50", end: "05:00" },
  };
  const plan = optimizeCrons(
    [cron(1, "ARTICLE", ["09:00", "10:00"], [0]), cron(2, "ARTICLE")],
    guide,
  );
  expect(plan.entries.at(-1)!.schedule.times).toEqual(["00:10"]);
});
it("does not drift weekly days or frequencies when optimized again", () => {
  const guide = {
    ...DEFAULT_CRON_GUIDE,
    production: { start: "23:50", end: "05:00" },
  };
  const first = optimizeCrons(
    [cron(1, "ARTICLE", ["09:00", "10:00"], [6]), cron(2, "ARTICLE")],
    guide,
  );
  const second = optimizeCrons(first.items, guide);
  const events = (plan: typeof first) =>
    plan.entries
      .flatMap((entry) =>
        entry.schedule.times.map(
          (time) =>
            `${entry.item.contentTypeId}:${entry.item.kind}:${entry.schedule.days.join(",")}:${time}`,
        ),
      )
      .sort();
  expect(events(second)).toEqual(events(first));
  expect(second.executions).toBe(first.executions);
});
it("retains all daily times and disabled jobs while excluding unavailable actions", () => {
  const disabled = cron(2, "ARTICLE");
  disabled.cron!.enabled = false;
  const unavailable = cron(3, "ARTICLE");
  unavailable.available = false;
  const plan = optimizeCrons(
    [cron(1, "ARTICLE", ["09:00", "10:00", "11:00"]), disabled, unavailable],
    DEFAULT_CRON_GUIDE,
  );
  expect(plan.entries).toHaveLength(1);
  expect(plan.entries[0].schedule.times).toEqual(["21:00", "21:10", "21:20"]);
  expect(plan.items).toContain(disabled);
  expect(plan.items).toContain(unavailable);
});
it("rejects insufficient production/post capacity, legacy jobs and unknown stages without partial plans", () => {
  const guide = {
    ...DEFAULT_CRON_GUIDE,
    production: { start: "21:00", end: "21:15" },
  };
  expect(() =>
    optimizeCrons([cron(1, "ARTICLE"), cron(2, "ARTICLE")], guide),
  ).toThrow("penuh");
  const posting = {
    morning: { start: "06:00", end: "06:05" },
    noon: { start: "11:00", end: "11:05" },
    evening: { start: "16:00", end: "16:05" },
  };
  expect(() =>
    optimizeCrons([cron(1, "POST_IG")], { ...DEFAULT_CRON_GUIDE, posting }),
  ).toThrow("penuh");
  const legacy = cron(1, "ARTICLE");
  legacy.cron!.schedule = null;
  expect(() => optimizeCrons([legacy], DEFAULT_CRON_GUIDE)).toThrow(
    "jadwal lama",
  );
  expect(() => optimizeCrons([cron(1, "INVALID")], DEFAULT_CRON_GUIDE)).toThrow(
    "belum tersedia",
  );
  expect(() => optimizeCrons([], DEFAULT_CRON_GUIDE)).toThrow("Tidak ada");
});
it("keeps every generated weekly duration and gap free from overlap", () => {
  const guide = {
    ...DEFAULT_CRON_GUIDE,
    production: { start: "23:00", end: "05:00" },
    gapMinutes: 3,
  };
  const plan = optimizeCrons(
    [
      cron(1, "ARTICLE", ["08:00", "09:00"], [0, 3]),
      cron(2, "IMAGES_PANEL", ["08:00"], [3, 6]),
      cron(3, "ARTICLE"),
      cron(3, "TTS_KALIMAT"),
      cron(3, "IMAGES_VIDEO"),
      cron(3, "VIDEO_KALIMAT"),
    ],
    guide,
  );
  const slots = new Set<number>();
  for (const entry of plan.entries) {
    const days =
      entry.schedule.mode === "daily"
        ? [0, 1, 2, 3, 4, 5, 6]
        : entry.schedule.days;
    for (const day of days)
      for (const time of entry.schedule.times)
        for (let m = 0; m < entry.duration + guide.gapMinutes; m++) {
          const minute = (day * 1440 + timeMinutes(time) + m) % 10080;
          expect(slots.has(minute)).toBe(false);
          slots.add(minute);
        }
  }
});
