import { expect, it, vi } from "vitest";
import { optimizeCronRecords } from "../src/server/cron-optimize-store";
import { DEFAULT_CRON_GUIDE } from "../src/server/cron-guide-domain";

function database(failWrite = false, posting = false) {
  let guide = {
    ...DEFAULT_CRON_GUIDE,
    production: { start: "23:50", end: "05:00" },
  };
  const rows = [
    {
      content_type_id: 1,
      book_key: "@content-type",
      kind: "ARTICLE",
      schedule_id: "weekly",
      enabled: 1,
      interval_hours: 24,
      schedule_json: JSON.stringify({
        mode: "weekly",
        days: [6],
        times: ["09:00", "10:00"],
      }),
      next_run: null,
      last_tick: 123,
      last_result: "keep",
    },
    {
      content_type_id: 2,
      book_key: "@content-type",
      kind: "ARTICLE",
      schedule_id: "disabled",
      enabled: 0,
      interval_hours: 24,
      schedule_json: JSON.stringify({
        mode: "daily",
        days: [],
        times: ["09:00"],
      }),
      next_run: null,
      last_tick: 123,
      last_result: "keep",
    },
  ];
  if (posting) rows[0].kind = "POST_IG";
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql: string, params?: any[]) => {
      if (sql.includes("FROM content_types"))
        return [
          [1, 2].map((id) => ({
            id,
            name: `Type ${id}`,
            engine: "book",
            outputs: '["ARTICLE","PANEL"]',
            settings: null,
          })),
        ];
      if (sql.includes("FROM cron_guide"))
        return [[{ id: 1, settings: JSON.stringify(guide) }]];
      if (sql.includes("FROM book_cron")) return [structuredClone(rows)];
      if (sql.includes("FROM news_cron")) return [[]];
      if (failWrite && sql.startsWith("INSERT")) throw Error("insert failed");
      return [{ affectedRows: 1 }];
    }),
  };
  return {
    db: { getConnection: async () => connection } as any,
    connection,
    change: () => {
      guide = { ...guide, gapMinutes: 5 };
    },
  };
}
it("previews without writing and applies recomputed day groups in one transaction", async () => {
  const { db, connection } = database();
  const preview = await optimizeCronRecords(db);
  expect(preview.entries).toHaveLength(2);
  expect(
    connection.query.mock.calls.some(
      ([sql]) => sql.startsWith("UPDATE") || sql.startsWith("INSERT"),
    ),
  ).toBe(false);
  expect(preview.revision).toMatch(/^[a-f0-9]{64}$/);
  const applied = await optimizeCronRecords(
    db,
    preview.revision,
    Date.parse("2026-10-11T00:00:00+07:00"),
  );
  expect(applied.applied).toBe(true);
  const writes = connection.query.mock.calls.filter(
    ([sql]) => sql.startsWith("UPDATE") || sql.startsWith("INSERT"),
  );
  expect(writes).toHaveLength(2);
  expect(writes[0][0]).toContain("SET schedule_json=?,next_run=?");
  expect(writes[0][1]?.slice(2)).toEqual([
    1,
    "@content-type",
    "ARTICLE",
    "weekly",
  ]);
  expect(writes[1][0]).toContain("INSERT INTO book_cron");
  expect(JSON.parse(writes[1][1]![4]).days).toEqual([6]);
  expect(connection.commit).toHaveBeenCalledTimes(2);
  expect(connection.release).toHaveBeenCalledTimes(2);
});
it("applies exactly the randomized posting allocation from the preview", async () => {
  const { db } = database(false, true);
  const preview = await optimizeCronRecords(db);
  const applied = await optimizeCronRecords(db, preview.revision);
  expect(applied.entries.map((entry) => entry.schedule)).toEqual(
    preview.entries.map((entry) => entry.schedule),
  );
  expect(preview.entries[0].schedule.times).toHaveLength(2);
  const hours = preview.entries[0].schedule.times.map(
    (time) => time.split(":")[0],
  );
  expect(new Set(hours).size).toBe(2);
});
it("rejects a stale preview before any write", async () => {
  const { db, connection, change } = database();
  const preview = await optimizeCronRecords(db);
  change();
  await expect(optimizeCronRecords(db, preview.revision)).rejects.toThrow(
    "berubah sejak pratinjau",
  );
  expect(
    connection.query.mock.calls.some(
      ([sql]) => sql.startsWith("UPDATE") || sql.startsWith("INSERT"),
    ),
  ).toBe(false);
  expect(connection.rollback).toHaveBeenCalledOnce();
});
it("rolls back all changes when a split schedule insert fails", async () => {
  const { db, connection } = database(true);
  const preview = await optimizeCronRecords(db);
  await expect(optimizeCronRecords(db, preview.revision)).rejects.toThrow(
    "insert failed",
  );
  expect(connection.rollback).toHaveBeenCalledOnce();
  expect(connection.commit).toHaveBeenCalledOnce();
  expect(connection.release).toHaveBeenCalledTimes(2);
});
