import type mysql from "mysql2/promise";
import {
  TIMING_STAGES,
  timingEta,
  type ProcessTiming,
  type TimingStage,
} from "./process-timing-domain";
import { loadCronGuide } from "./cron-guide-store";
export async function listProcessTimings(db: mysql.Pool) {
  const [rows]: any = await db.query(
    "SELECT * FROM process_timings ORDER BY finished_at DESC,id DESC",
  );
  return rows.map((row: any) => ({
    ...row,
    id: Number(row.id),
    started_at: Number(row.started_at),
    finished_at: Number(row.finished_at),
    duration_ms: Number(row.duration_ms),
  })) as ProcessTiming[];
}
export async function recordProcessTiming(
  db: mysql.Pool,
  value: Omit<ProcessTiming, "id">,
) {
  if (
    !TIMING_STAGES.some(([stage]) => stage === value.stage) ||
    !Number.isFinite(value.duration_ms) ||
    value.duration_ms < 1
  )
    throw Error("Data durasi proses tidak valid");
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      "SELECT stage FROM process_timing_locks WHERE stage=? FOR UPDATE",
      [value.stage],
    );
    await connection.query(
      "INSERT IGNORE INTO process_timings(stage,source,job_id,attempt,kind,content_type_id,title,status,started_at,finished_at,duration_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      [
        value.stage,
        value.source,
        value.job_id,
        value.attempt,
        value.kind,
        value.content_type_id,
        value.title.slice(0, 500),
        value.status,
        value.started_at,
        value.finished_at,
        Math.round(value.duration_ms),
      ],
    );
    const [keep]: any = await connection.query(
      "SELECT id FROM process_timings WHERE stage=? ORDER BY finished_at DESC,id DESC LIMIT 20",
      [value.stage],
    );
    if (keep.length)
      await connection.query(
        `DELETE FROM process_timings WHERE stage=? AND id NOT IN (${keep.map(() => "?").join(",")})`,
        [value.stage, ...keep.map((row: any) => row.id)],
      );
    await connection.commit();
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
}
// Called only after the worker finishes its attempt; queue waiting is excluded.
export async function finishProcessTiming(
  db: mysql.Pool,
  source: "book" | "news" | "news-media",
  job: { id: number; attempts: number; kind?: string },
  stage: TimingStage | null,
  startedAt: number,
  durationMs: number,
) {
  if (!stage) return;
  const finishedAt = Date.now();
  try {
    const query =
      source === "book"
        ? "SELECT j.state,j.kind,c.content_type_id,CONCAT(c.book,' · ',c.title) title FROM jobs j JOIN chapters c ON c.id=j.chapter_id WHERE j.id=? AND j.attempts=?"
        : source === "news-media"
          ? "SELECT j.state,j.kind,n.content_type_id,n.title FROM news_media_jobs j JOIN news_articles n ON n.id=j.news_id WHERE j.id=? AND j.attempts=?"
          : "SELECT state,'ARTICLE' kind,content_type_id,title FROM news_articles WHERE id=? AND attempts=?";
    const [rows]: any = await db.query(query, [job.id, job.attempts]);
    const row = rows[0];
    if (!row || !["completed", "failed"].includes(row.state)) return;
    await recordProcessTiming(db, {
      stage,
      source,
      job_id: job.id,
      attempt: job.attempts,
      kind: row.kind,
      content_type_id: row.content_type_id ?? null,
      title: row.title || "",
      status: row.state,
      started_at: startedAt,
      finished_at: finishedAt,
      duration_ms: Math.max(1, Math.round(durationMs)),
    });
  } catch (e) {
    console.error("Pencatatan durasi proses gagal:", (e as Error).message);
  }
}
export async function applyTimingEta(db: mysql.Pool, stage: unknown) {
  if (!TIMING_STAGES.some(([key]) => key === stage))
    throw Error("Jenis ETA tidak valid");
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      "SELECT stage FROM process_timing_locks WHERE stage=? FOR UPDATE",
      [stage],
    );
    await connection.query("SELECT id FROM cron_guide WHERE id=1 FOR UPDATE");
    const pool = connection as unknown as mysql.Pool;
    const recommendation = timingEta(await listProcessTimings(pool)).find(
      (item) => item.stage === stage,
    )!;
    if (recommendation.minutes === null)
      throw Error("Belum ada proses berhasil untuk rekomendasi ETA");
    if (recommendation.minutes > 1440)
      throw Error("Rekomendasi melebihi batas durasi Guide (1440 menit)");
    const guide = await loadCronGuide(pool);
    guide.durations[recommendation.stage] = recommendation.minutes;
    await connection.query(
      "INSERT INTO cron_guide(id,settings) VALUES(1,?) ON DUPLICATE KEY UPDATE settings=VALUES(settings)",
      [JSON.stringify(guide)],
    );
    await connection.commit();
    return guide;
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
}
