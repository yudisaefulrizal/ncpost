import { randomUUID } from "node:crypto";
import type mysql from "mysql2/promise";
import { normalizeCron, type BookCron } from "./cron";
import { normalizeSchedule, nextScheduleRun } from "./cron-schedule";

type Scope = {
  table: "book_cron" | "news_cron";
  where: string;
  params: unknown[];
};
export function decodeCron(row: any, book: string): BookCron<string> {
  return {
    id: row.schedule_id,
    book,
    kind: row.kind,
    enabled: !!row.enabled,
    intervalHours: Number(row.interval_hours ?? 24),
    batchSize: 1,
    schedule: row.schedule_json
      ? normalizeSchedule(JSON.parse(row.schedule_json))
      : null,
    next_run: row.next_run == null ? null : Number(row.next_run),
    last_tick: row.last_tick == null ? null : Number(row.last_tick),
    last_result: row.last_result ?? null,
  };
}
export async function saveCronRecord(
  db: mysql.Pool,
  scope: Scope,
  input: any,
  kinds: readonly string[],
  now = Date.now(),
) {
  if (!input || typeof input !== "object") throw Error("Jadwal tidak valid");
  const id = input.id === undefined ? randomUUID() : validId(input.id);
  let existing: any;
  if (input.id !== undefined) {
    const [found]: any = await db.query(
      `SELECT schedule_id,schedule_json FROM ${scope.table} WHERE ${scope.where} AND schedule_id=?`,
      [...scope.params, id],
    );
    existing = found[0];
    if (!existing) throw Error("Jadwal tidak ditemukan pada jenis konten ini");
  }
  const legacy = existing && !existing.schedule_json && input.schedule == null;
  const schedule = legacy ? null : normalizeSchedule(input?.schedule);
  const value = normalizeCron(
    {
      ...input,
      batchSize: 1,
      intervalHours: legacy ? input.intervalHours : 24,
    },
    kinds,
  );
  const fields = [
    value.kind,
    value.enabled ? 1 : 0,
    value.batchSize,
    schedule ? JSON.stringify(schedule) : null,
    value.enabled
      ? schedule
        ? nextScheduleRun(schedule, now)
        : now + value.intervalHours * 3600000
      : null,
    value.intervalHours,
  ];
  if (input.id !== undefined) {
    const [result]: any = await db.query(
      `UPDATE ${scope.table} SET kind=?,enabled=?,batch_size=?,schedule_json=?,next_run=?,interval_hours=? WHERE ${scope.where} AND schedule_id=?`,
      [...fields, ...scope.params, id],
    );
    if (!result.affectedRows)
      throw Error("Jadwal tidak ditemukan pada jenis konten ini");
  } else if (scope.table === "book_cron") {
    await db.query(
      "INSERT INTO book_cron(kind,enabled,batch_size,schedule_json,next_run,interval_hours,content_type_id,book_key,schedule_id) VALUES(?,?,?,?,?,?,?,?,?)",
      [...fields, ...scope.params, id],
    );
  } else {
    await db.query(
      "INSERT INTO news_cron(kind,enabled,batch_size,schedule_json,next_run,interval_hours,category,schedule_id) VALUES(?,?,?,?,?,?,?,?)",
      [...fields, ...scope.params, id],
    );
  }
  return { ...value, id, schedule };
}
export async function deleteCronRecord(
  db: mysql.Pool,
  scope: Scope,
  id: unknown,
) {
  const [result]: any = await db.query(
    `DELETE FROM ${scope.table} WHERE ${scope.where} AND schedule_id=?`,
    [...scope.params, validId(id)],
  );
  if (!result.affectedRows)
    throw Error("Jadwal tidak ditemukan pada jenis konten ini");
}
function validId(id: unknown) {
  if (typeof id !== "string" || !/^[a-f\d-]{36}$/i.test(id))
    throw Error("ID jadwal tidak valid");
  return id;
}
