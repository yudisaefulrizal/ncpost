import type mysql from "mysql2/promise";
let database: mysql.Pool | undefined;
export function configureImageTiming(db: mysql.Pool | undefined) {
  database = db;
}
export function averageImageDuration(rows: { duration_ms: number }[]) {
  const durations = rows
    .map((row) => Number(row.duration_ms))
    .filter((ms) => Number.isFinite(ms) && ms > 0);
  return durations.length
    ? Math.round(durations.reduce((sum, ms) => sum + ms, 0) / durations.length)
    : null;
}
export async function listImageTimings(db: mysql.Pool) {
  const [rows]: any = await db.query(
    "SELECT id,orientation,duration_ms,finished_at FROM image_generation_timings ORDER BY id DESC LIMIT 20",
  );
  return {
    history: rows,
    averageMs: averageImageDuration(rows),
    samples: rows.length,
  };
}
export async function recordImageTiming(
  durationMs: number,
  orientation: string,
  db = database,
) {
  if (!db || !Number.isFinite(durationMs) || durationMs < 1) return;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    // Shared row lock serializes retention across concurrent web/worker processes.
    await connection.query(
      "SELECT stage FROM process_timing_locks WHERE stage='images' FOR UPDATE",
    );
    await connection.query(
      "INSERT INTO image_generation_timings(orientation,duration_ms) VALUES(?,?)",
      [orientation, Math.round(durationMs)],
    );
    const [keep]: any = await connection.query(
      "SELECT id FROM image_generation_timings ORDER BY id DESC LIMIT 20",
    );
    if (keep.length)
      await connection.query(
        `DELETE FROM image_generation_timings WHERE id NOT IN (${keep.map(() => "?").join(",")})`,
        keep.map((row: any) => row.id),
      );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
