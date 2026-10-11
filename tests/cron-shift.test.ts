import { expect, it, vi } from "vitest";
import { shiftSchedule, shiftAllCrons } from "../src/server/cron-shift";

it("shifts times in both directions across midnight and keeps weekly days", () => {
  const schedule = {
    mode: "weekly" as const,
    days: [1, 3],
    times: ["00:05", "23:55"],
  };
  expect(shiftSchedule(schedule, 15)).toEqual({
    mode: "weekly",
    days: [1, 3],
    times: ["00:10", "00:20"],
  });
  expect(shiftSchedule(schedule, -15).times).toEqual(["23:40", "23:50"]);
  expect(schedule.times).toEqual(["00:05", "23:55"]);
  for (const minutes of [0, 1440, -1440, 1.5, NaN])
    expect(() => shiftSchedule(schedule, minutes)).toThrow();
});

function database(fail = false) {
  const row = {
    content_type_id: 1,
    book_key: "@content-type",
    kind: "ARTICLE",
    schedule_id: "a",
    enabled: 1,
    schedule_json: JSON.stringify({
      mode: "daily",
      days: [],
      times: ["09:00"],
    }),
  };
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT"))
        return [
          [
            row,
            { ...row, enabled: 0, schedule_id: "b" },
            { ...row, schedule_json: null },
          ],
        ];
      if (fail) throw Error("write failed");
      return [{ affectedRows: 1 }];
    }),
  };
  return { connection, db: { getConnection: async () => connection } as any };
}
it("updates active and inactive schedules atomically and skips legacy intervals", async () => {
  const { db, connection } = database();
  expect(
    await shiftAllCrons(db, 15, Date.parse("2026-10-11T08:00:00+07:00")),
  ).toEqual({ updated: 4, skipped: 2 });
  const writes = connection.query.mock.calls.filter(([sql]) =>
    sql.startsWith("UPDATE"),
  ) as any[];
  expect(JSON.parse(writes[0][1][0]).times).toEqual(["09:15"]);
  expect(writes[0][1][1]).toBe(Date.parse("2026-10-11T09:15:00+07:00"));
  expect(writes[1][1][1]).toBeNull();
  expect(connection.commit).toHaveBeenCalledOnce();
  expect(connection.rollback).not.toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalledOnce();
});
it("rolls back the whole shift when a database write fails", async () => {
  const { db, connection } = database(true);
  await expect(shiftAllCrons(db, -15)).rejects.toThrow("write failed");
  expect(connection.rollback).toHaveBeenCalledOnce();
  expect(connection.commit).not.toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalledOnce();
});
