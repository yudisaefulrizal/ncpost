import { createHash, randomUUID } from "node:crypto";
import type mysql from "mysql2/promise";
import { ContentTypeStore } from "./content-types";
import { CONTENT_CRON_KEY } from "./cron";
import { decodeCron } from "./cron-records";
import { loadCronGuide } from "./cron-guide-store";
import { cronSource, optimizeCrons } from "./cron-optimize-domain";
import { upcomingForType, type UpcomingCron } from "./cron-upcoming";
import { nextScheduleRun } from "./cron-schedule";

// Both preview and apply read a coherent, locked snapshot. Apply recomputes server-side.
export async function optimizeCronRecords(
  db: mysql.Pool,
  revision?: unknown,
  now = Date.now(),
) {
  if (
    revision !== undefined &&
    (typeof revision !== "string" || !/^[a-f0-9]{64}$/.test(revision))
  )
    throw Error("Pratinjau optimasi tidak valid");
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      "SELECT id FROM content_types WHERE deleted_at IS NULL ORDER BY id FOR UPDATE",
    );
    await connection.query("SELECT id FROM cron_guide WHERE id=1 FOR UPDATE");
    const pool = connection as unknown as mysql.Pool;
    const types = await new ContentTypeStore(pool).list();
    const guide = await loadCronGuide(pool);
    const items: UpcomingCron[] = [];
    const sources = new Map<
      string,
      { table: "book_cron" | "news_cron"; row: any }
    >();
    for (const table of ["book_cron", "news_cron"] as const) {
      const [rows]: any = await connection.query(
        `SELECT * FROM ${table} ORDER BY schedule_id,kind FOR UPDATE`,
      );
      for (const row of rows) {
        const type = types.find((type) =>
          table === "book_cron"
            ? type.engine !== "news" &&
              type.id === row.content_type_id &&
              row.book_key === CONTENT_CRON_KEY
            : type.engine === "news" &&
              row.category ===
                (type.id === 2 ? "teknologi" : `type-${type.id}`),
        );
        if (!type) continue;
        const item = upcomingForType(
          type,
          [decodeCron(row, type.name)],
          true,
        )[0];
        items.push(item);
        sources.set(cronSource(item), { table, row });
      }
    }
    const snapshot = {
      version: 2,
      guide,
      types,
      schedules: items.map((item) => ({
        source: cronSource(item),
        enabled: item.cron!.enabled,
        schedule: item.cron!.schedule,
        interval: item.cron!.intervalHours,
        available: item.available,
      })),
    };
    const token = createHash("sha256")
      .update(JSON.stringify(snapshot))
      .digest("hex");
    if (revision !== undefined && revision !== token)
      throw Error(
        "Jadwal atau Guide berubah sejak pratinjau. Jalankan Optimasi lagi sebelum menerapkan.",
      );
    const plan = optimizeCrons(items, guide, token);
    if (revision !== undefined) {
      const used = new Set<string>();
      for (const entry of plan.entries) {
        const { table, row } = sources.get(entry.source)!;
        const nextRun = nextScheduleRun(entry.schedule, now);
        if (!used.has(entry.source)) {
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
            [JSON.stringify(entry.schedule), nextRun, ...key],
          );
          used.add(entry.source);
        } else {
          // A weekly schedule may straddle midnight; separate day groups prevent extra executions.
          const columns =
            table === "book_cron" ? "content_type_id,book_key" : "category";
          const key =
            table === "book_cron"
              ? [row.content_type_id, row.book_key]
              : [row.category];
          const values = [
            ...key,
            row.kind,
            randomUUID(),
            JSON.stringify(entry.schedule),
            nextRun,
            row.last_tick,
            row.last_result,
            ...(table === "book_cron" ? [row.last_item_id || 0] : []),
          ];
          await connection.query(
            `INSERT INTO ${table} (${columns},kind,schedule_id,schedule_json,next_run,last_tick,last_result${table === "book_cron" ? ",last_item_id" : ""},enabled,interval_hours,batch_size) VALUES(${values.map(() => "?").join(",")},1,24,1)`,
            values,
          );
        }
      }
    }
    await connection.commit();
    return { ...plan, revision: token, applied: revision !== undefined };
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
}
