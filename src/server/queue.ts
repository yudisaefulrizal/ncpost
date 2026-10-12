import type { Store } from "./store";
import { ContentTypeStore, withContentType } from "./content-types";
import { NewsMediaStore } from "./news-media-store";
import { NewsStore } from "./news-store";
export const QUEUE_SOURCES = ["book", "news-article", "news-media"] as const;
export type QueueSource = (typeof QUEUE_SOURCES)[number];
export interface QueueItem {
  can_retry: number;
  source: QueueSource;
  id: number;
  content_id: number;
  content_type_id: number;
  content_type: string;
  title: string;
  kind: string;
  state: string;
  error: string | null;
  created_at: string | null;
}
export async function listQueue(store: Store, state?: string) {
  if (
    state &&
    !["queued", "running", "failed", "completed", "cancelled"].includes(state)
  )
    throw Error("Status antrean tidak valid");
  const sql = `SELECT * FROM (
    SELECT 'book' AS source,j.id,j.chapter_id AS content_id,c.content_type_id,t.name AS content_type,
      CONCAT(c.book,' · ',c.title) AS title,j.kind,j.state,j.error,j.created_at,
      (j.state IN ('failed','cancelled') AND j.revision=c.revision AND NOT EXISTS(SELECT 1 FROM jobs newer WHERE newer.chapter_id=j.chapter_id AND newer.kind=j.kind AND newer.id>j.id)) AS can_retry
      FROM jobs j JOIN chapters c ON c.id=j.chapter_id JOIN content_types t ON t.id=c.content_type_id WHERE j.queue_cleared_at IS NULL
    UNION ALL
    SELECT 'news-article',n.id,n.id,n.content_type_id,t.name,COALESCE(NULLIF(n.title,''),'Artikel baru'),
      'ARTICLE',n.state,n.error,n.created_at,(n.state IN ('failed','cancelled')) FROM news_articles n JOIN content_types t ON t.id=n.content_type_id WHERE n.queue_cleared_at IS NULL
    UNION ALL
    SELECT 'news-media',j.id,j.news_id,n.content_type_id,t.name,n.title,j.kind,j.state,j.error,j.created_at,
      (j.state IN ('failed','cancelled') AND j.revision=n.attempts AND NOT EXISTS(SELECT 1 FROM news_media_jobs newer WHERE newer.news_id=j.news_id AND newer.kind=j.kind AND newer.id>j.id))
      FROM news_media_jobs j JOIN news_articles n ON n.id=j.news_id JOIN content_types t ON t.id=n.content_type_id WHERE j.queue_cleared_at IS NULL
    ) queue ${state ? "WHERE state=?" : ""}
    ORDER BY CASE state WHEN 'running' THEN 0 WHEN 'queued' THEN 1 WHEN 'failed' THEN 2 ELSE 3 END,created_at DESC,id DESC LIMIT 500`;
  const params = state ? [state] : [];
  try {
    const [items]: any = await store.db.query(sql, params);
    return items as QueueItem[];
  } catch (error) {
    const failure = error as { code?: string; message?: string };
    if (
      failure.code !== "ER_BAD_FIELD_ERROR" ||
      !failure.message?.includes("j.created_at")
    )
      throw error;
    const [items]: any = await store.db.query(
      sql.replaceAll("j.created_at", "NULL AS created_at"),
      params,
    );
    return items as QueueItem[];
  }
}
export async function clearQueue(store: Store) {
  const connection = await store.db.getConnection();
  let cleared = 0;
  try {
    await connection.beginTransaction();
    for (const table of ["jobs", "news_articles", "news_media_jobs"]) {
      const [result]: any = await connection.query(
        `UPDATE ${table} SET lease=0,state=IF(state='queued','cancelled',state),queue_cleared_at=CURRENT_TIMESTAMP WHERE state IN ('queued','failed','completed','cancelled') AND queue_cleared_at IS NULL`,
      );
      cleared += result.affectedRows;
    }
    await connection.commit();
    return { cleared };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
export async function queueAction(
  store: Store,
  source: unknown,
  rawId: unknown,
  action: unknown,
) {
  if (!QUEUE_SOURCES.includes(source as QueueSource))
    throw Error("Sumber antrean tidak valid");
  const id = Number(rawId);
  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !["cancel", "retry"].includes(String(action))
  )
    throw Error("Aksi antrean tidak valid");
  const table =
    source === "book"
      ? "jobs"
      : source === "news-media"
        ? "news_media_jobs"
        : "news_articles";
  if (action === "cancel") {
    // The generation token remains changed even if a cancelled item is immediately retried.
    const [result]: any = await store.db.query(
      `UPDATE ${table} SET state='cancelled',lease=0,cancel_version=cancel_version+1,error='Generate dibatalkan oleh pengguna' WHERE id=? AND (state='queued' OR (state='running'${source === "news-article" ? "" : " AND kind NOT IN ('POST_IG','REELS_IG')"}))`,
      [id],
    );
    if (!result.affectedRows)
      throw Error("Pekerjaan sudah selesai atau sedang melakukan posting");
    return;
  }
  const sql =
    source === "book"
      ? "SELECT j.*,c.content_type_id,c.revision AS current_revision,(SELECT MAX(newer.id) FROM jobs newer WHERE newer.chapter_id=j.chapter_id AND newer.kind=j.kind) AS latest_id FROM jobs j JOIN chapters c ON c.id=j.chapter_id WHERE j.id=?"
      : source === "news-media"
        ? "SELECT j.*,n.content_type_id,n.attempts AS current_revision,(SELECT MAX(newer.id) FROM news_media_jobs newer WHERE newer.news_id=j.news_id AND newer.kind=j.kind) AS latest_id FROM news_media_jobs j JOIN news_articles n ON n.id=j.news_id WHERE j.id=?"
        : "SELECT * FROM news_articles WHERE id=?";
  const [rows]: any = await store.db.query(sql, [id]);
  const job = rows[0];
  if (!job || !["failed", "cancelled"].includes(job.state))
    throw Error("Hanya pekerjaan gagal atau dibatalkan dapat dicoba ulang");
  if (source !== "news-article" && job.revision !== job.current_revision)
    throw Error("Konten sudah berubah. Jalankan aksi dari Produksi terbaru.");
  if (job.latest_id !== undefined && Number(job.latest_id) !== id)
    throw Error("Pekerjaan ini sudah memiliki percobaan yang lebih baru.");
  const type = await new ContentTypeStore(store.db).get(job.content_type_id);
  return withContentType(type, async () => {
    if (source === "book")
      return store.enqueue(job.chapter_id, job.kind, !!job.force_new);
    if (source === "news-media")
      return new NewsMediaStore(store.db).enqueue(
        job.news_id,
        job.kind,
        !!job.force_new,
      );
    return new NewsStore(store.db).retry(job.id);
  });
}
