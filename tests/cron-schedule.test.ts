import { expect, it, vi } from "vitest";
import {
  nextScheduleRun,
  normalizeSchedule,
  cronNextRun,
} from "../src/server/cron-schedule";
import { saveCronRecord, deleteCronRecord } from "../src/server/cron-records";
const scope = {
  table: "book_cron" as const,
  where: "content_type_id=? AND book_key=?",
  params: [7, "@content-type"],
};
const daily = { mode: "daily" as const, times: ["08:00", "16:00"], days: [] };
const now = Date.parse("2026-10-11T01:00:00Z"); // Sunday 08:00 WIB
it("harian melewati jam sekarang, memakai WIB, dan berlanjut esok hari", () => {
  expect(nextScheduleRun(daily, now)).toBe(Date.parse("2026-10-11T09:00:00Z"));
  expect(nextScheduleRun(daily, Date.parse("2026-10-11T09:00:00Z"))).toBe(
    Date.parse("2026-10-12T01:00:00Z"),
  );
  expect(
    nextScheduleRun(
      { ...daily, times: ["00:00"] },
      Date.parse("2026-12-31T16:59:00Z"),
    ),
  ).toBe(Date.parse("2026-12-31T17:00:00Z"));
});
it("mingguan memilih hari berikutnya dan bergulir ke minggu selanjutnya", () => {
  expect(
    nextScheduleRun({ mode: "weekly", times: ["09:00"], days: [1, 4] }, now),
  ).toBe(Date.parse("2026-10-12T02:00:00Z"));
  expect(
    nextScheduleRun({ mode: "weekly", times: ["08:00"], days: [0] }, now),
  ).toBe(Date.parse("2026-10-18T01:00:00Z"));
});
it("waktu terlewat tidak dirapel dan interval lama tetap berjalan", () => {
  expect(nextScheduleRun(daily, Date.parse("2026-10-16T10:00:00Z"))).toBe(
    Date.parse("2026-10-17T01:00:00Z"),
  );
  expect(cronNextRun({ interval_hours: 25 }, now)).toBe(now + 25 * 3600000);
});
it("menormalkan jam/hari ganda dan menolak jadwal invalid", () => {
  expect(
    normalizeSchedule({
      mode: "weekly",
      times: ["16:00", "08:00", "08:00"],
      days: [4, 1, 1],
    }),
  ).toEqual({ mode: "weekly", times: ["08:00", "16:00"], days: [1, 4] });
  for (const input of [
    null,
    { ...daily, times: [] },
    { ...daily, times: ["24:00"] },
    { ...daily, times: ["8:00"] },
    { ...daily, mode: "weekly", days: [] },
    { ...daily, mode: "weekly", days: [7] },
  ])
    expect(() => normalizeSchedule(input)).toThrow();
});
it("menambah dua jadwal aksi sama tanpa menimpa, dan menyimpan waktu kalender", async () => {
  const db = { query: vi.fn(async () => [{ affectedRows: 1 }]) } as any;
  const input = {
    kind: "ARTICLE",
    enabled: true,
    batchSize: 2,
    schedule: daily,
  };
  const a = await saveCronRecord(db, scope, input, ["ARTICLE"], now);
  const b = await saveCronRecord(db, scope, input, ["ARTICLE"], now);
  expect(a.id).not.toBe(b.id);
  expect(db.query).toHaveBeenCalledWith(
    expect.stringContaining("INSERT INTO book_cron"),
    [
      "ARTICLE",
      1,
      1,
      JSON.stringify(daily),
      Date.parse("2026-10-11T09:00:00Z"),
      24,
      7,
      "@content-type",
      a.id,
    ],
  );
});
it("sunting dan hapus dibatasi ID serta jenis konten, bukan hanya aksi", async () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  const db = {
    query: vi.fn(async (sql: string) =>
      sql.startsWith("SELECT")
        ? [[{ schedule_id: id, schedule_json: JSON.stringify(daily) }]]
        : [{ affectedRows: 1 }],
    ),
  } as any;
  await saveCronRecord(
    db,
    scope,
    { id, kind: "ARTICLE", enabled: false, schedule: daily },
    ["ARTICLE"],
    now,
  );
  expect(db.query).toHaveBeenLastCalledWith(
    expect.stringContaining(
      "WHERE content_type_id=? AND book_key=? AND schedule_id=?",
    ),
    ["ARTICLE", 0, 1, JSON.stringify(daily), null, 24, 7, "@content-type", id],
  );
  await deleteCronRecord(db, scope, id);
  expect(db.query).toHaveBeenLastCalledWith(
    expect.stringContaining("DELETE FROM book_cron"),
    [7, "@content-type", id],
  );
  db.query.mockResolvedValueOnce([[]]);
  await expect(
    saveCronRecord(
      db,
      scope,
      { id, kind: "ARTICLE", enabled: true, schedule: daily },
      ["ARTICLE"],
      now,
    ),
  ).rejects.toThrow("tidak ditemukan");
});
it("nonaktif/aktif interval lama mempertahankan interval, tanpa konversi diam-diam", async () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  const db = {
    query: vi.fn(async (sql: string) =>
      sql.startsWith("SELECT")
        ? [[{ schedule_id: id, schedule_json: null }]]
        : [{ affectedRows: 1 }],
    ),
  } as any;
  await saveCronRecord(
    db,
    scope,
    { id, kind: "ARTICLE", enabled: true, intervalHours: 25, schedule: null },
    ["ARTICLE"],
    now,
  );
  expect(db.query).toHaveBeenLastCalledWith(expect.any(String), [
    "ARTICLE",
    1,
    1,
    null,
    now + 25 * 3600000,
    25,
    7,
    "@content-type",
    id,
  ]);
});
