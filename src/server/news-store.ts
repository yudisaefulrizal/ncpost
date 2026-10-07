import type { NewsProductionData } from "./news-production-domain";
import type { BookSettings } from "./book-settings";
import type mysql from "mysql2/promise";
import { createHash } from "node:crypto";
import { newsSourceKey, type NewsResult, validateNewsResult } from "./news";
export interface NewsArticle {
  production?: NewsProductionData;
  settings?: BookSettings;
  id: number;
  category: string;
  state: string;
  attempts: number;
  lease: number;
  title: string;
  article: string;
  source_url: string | null;
  candidates: string | null;
  artifacts: string | null;
  error: string | null;
  created_at: string;
}
export class NewsStore {
  constructor(readonly db: mysql.Pool) {}
  async list() {
    const [rows] = await this.db.query(
      "SELECT id,category,state,attempts,lease,title,article,source_url,candidates,artifacts,error,created_at FROM news_articles ORDER BY id DESC",
    );
    return rows as NewsArticle[];
  }
  async create() {
    const [result] = await this.db.query<mysql.ResultSetHeader>(
      "INSERT INTO news_articles(category,state,title,article) VALUES('teknologi','queued','','')",
    );
    return result.insertId;
  }
  async retry(id: number) {
    const [r] = await this.db.query<mysql.ResultSetHeader>(
      "UPDATE news_articles SET state='queued',error=NULL,lease=0 WHERE id=? AND state='failed'",
      [id],
    );
    if (!r.affectedRows)
      throw Error("Hanya artikel berita gagal yang dapat dicoba ulang");
  }
  async regenerate(id: number) {
    const c = await this.db.getConnection();
    try {
      await c.beginTransaction();
      const [news]: any = await c.query(
        "SELECT state FROM news_articles WHERE id=? FOR UPDATE",
        [id],
      );
      if (news[0]?.state !== "completed")
        throw Error("Hanya artikel berita selesai yang dapat dibuat ulang");
      const [active]: any = await c.query(
        "SELECT id FROM news_media_jobs WHERE news_id=? AND state IN ('queued','running')",
        [id],
      );
      if (active.length)
        throw Error(
          "Tunggu produksi berita selesai sebelum membuat ulang artikel",
        );
      const [posts]: any = await c.query(
        "SELECT data FROM news_media_outputs WHERE news_id=? AND kind IN ('POST_IG','REELS_IG')",
        [id],
      );
      if (
        posts.some((p: any) =>
          ["processing", "preparing", "publishing", "unknown"].includes(
            JSON.parse(p.data).status,
          ),
        )
      )
        throw Error(
          "Periksa status publikasi Instagram sebelum membuat ulang artikel",
        );
      await c.query(
        "UPDATE news_articles SET state='queued',error=NULL,lease=0 WHERE id=?",
        [id],
      );
      await c.commit();
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }
  }
  async claim(now = Date.now()) {
    await this.db.query(
      "UPDATE news_articles SET state='failed',error='Proses terhenti; coba ulang pembuatan artikel',lease=0 WHERE state='running' AND lease<?",
      [now],
    );
    const c = await this.db.getConnection();
    try {
      // Avoid gap locks while several workers claim different queued articles.
      await c.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await c.beginTransaction();
      const [rows] = await c.query(
        "SELECT * FROM news_articles WHERE state='queued' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED",
      );
      const j = (rows as NewsArticle[])[0];
      if (j) {
        j.attempts++;
        j.lease = now + 300000;
        j.state = "running";
        await c.query(
          "UPDATE news_articles SET state='running',attempts=attempts+1,lease=?,error=NULL WHERE id=?",
          [j.lease, j.id],
        );
      }
      await c.commit();
      return j;
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }
  }
  async heartbeat(j: NewsArticle, now = Date.now()) {
    await this.db.query(
      "UPDATE news_articles SET lease=? WHERE id=? AND state='running' AND attempts=?",
      [now + 300000, j.id, j.attempts],
    );
  }
  async complete(j: NewsArticle, result: NewsResult, artifacts: unknown) {
    const v = validateNewsResult(result);
    const hash = createHash("sha256")
      .update(newsSourceKey(v.sourceUrl!).url)
      .digest("hex");
    try {
      const [r] = await this.db.query<mysql.ResultSetHeader>(
        "UPDATE news_articles SET state='completed',title=?,article=?,source_url=?,source_hash=?,candidates=?,artifacts=?,lease=0,error=NULL WHERE id=? AND state='running' AND attempts=?",
        [
          v.title,
          result.article,
          v.sourceUrl,
          hash,
          JSON.stringify(result.candidate_topics),
          JSON.stringify(artifacts),
          j.id,
          j.attempts,
        ],
      );
      return !!r.affectedRows;
    } catch (e) {
      if ((e as { code?: string }).code === "ER_DUP_ENTRY")
        throw Error(
          "Sumber berita ini sudah pernah dibuat. Coba ulang untuk mencari berita lain.",
        );
      throw e;
    }
  }
  async fail(j: NewsArticle, error: string) {
    await this.db.query(
      "UPDATE news_articles SET state='failed',error=?,lease=0 WHERE id=? AND state='running' AND attempts=?",
      [error, j.id, j.attempts],
    );
  }
}
