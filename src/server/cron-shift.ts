import type mysql from "mysql2/promise";
import { CONTENT_CRON_KEY } from "./cron";
import {
  normalizeSchedule,
  nextScheduleRun,
  type CronSchedule,
} from "./cron-schedule";

export function shiftSchedule(
  schedule: CronSchedule,
  minutes: number,
): CronSchedule {
  validateShift(minutes);
  const value = normalizeSchedule(schedule);
  return normalizeSchedule({
    ...value,
    times: value.times.map((time) => {
      const [h, m] = time.split(":").map(Number);
      const shifted = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
      return `${String(Math.floor(shifted / 60)).padStart(2, "0")}:${String(shifted % 60).padStart(2, "0")}`;
    }),
  });
}
function validateShift(minutes: number) {
  if (!Number.isInteger(minutes) || minutes === 0 || Math.abs(minutes) > 1439)
    throw Error("Isi pergeseran 1–1439 menit");
}

export async function shiftAllCrons(
  db: mysql.Pool,
  minutes: number,
  now = Date.now(),
) {
  validateShift(minutes);
  const connection = await db.getConnection();
  let updated = 0,
    skipped = 0;
  try {
    await connection.beginTransaction();
    for (const table of ["book_cron", "news_cron"] as const) {
      const join =
        table === "book_cron"
          ? "c.content_type_id=t.id AND t.engine<>'news'"
          : "c.category=IF(t.id=2,'teknologi',CONCAT('type-',t.id)) AND t.engine='news'";
      const [rows]: any = await connection.query(
        `SELECT c.* FROM ${table} c JOIN content_types t ON ${join} WHERE t.deleted_at IS NULL ${table === "book_cron" ? "AND c.book_key=?" : ""} ORDER BY c.schedule_id FOR UPDATE`,
        table === "book_cron" ? [CONTENT_CRON_KEY] : [],
      );
      for (const row of rows) {
        if (!row.schedule_json) {
          skipped++;
          continue;
        }
        const schedule = shiftSchedule(JSON.parse(row.schedule_json), minutes);
        const where =
          table === "book_cron"
            ? "content_type_id=? AND book_key=? AND kind=? AND schedule_id=?"
            : "category=? AND kind=? AND schedule_id=?";
        const key =
          table === "book_cron"
            ? [row.content_type_id, row.book_key, row.kind, row.schedule_id]
            : [row.category, row.kind, row.schedule_id];
        await connection.query(
          `UPDATE ${table} SET schedule_json=?,next_run=? WHERE ${where}`,
          [
            JSON.stringify(schedule),
            row.enabled ? nextScheduleRun(schedule, now) : null,
            ...key,
          ],
        );
        updated++;
      }
    }
    await connection.commit();
    return { updated, skipped };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
