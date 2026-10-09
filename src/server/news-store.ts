import { currentContentType } from "./content-types";
import type { NewsProductionData } from "./news-production-domain";
import type { BookSettings } from "./book-settings";
import type mysql from "mysql2/promise";
import { createHash } from "node:crypto";
import {
  newsSourceKey,
  type NewsResult,
  validateNewsResult,
  validateNewsArticle,
} from "./news";
export interface NewsArticle {
  content_type_id?: number;
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
      `SELECT id,content_type_id,category,state,attempts,lease,title,article,source_url,candidates,artifacts,error,created_at FROM news_articles ${currentContentType() ? "WHERE content_type_id=?" : ""} ORDER BY id DESC`,
      currentContentType() ? [currentContentType()!.id] : [],
    );
    return rows as NewsArticle[];
  }
  async create() {
    const [result] = await this.db.query<mysql.ResultSetHeader>(
      "INSERT INTO news_articles(category,state,title,article,content_type_id) VALUES('teknologi','queued','','',?)",
      [currentContentType()?.id ?? 2],
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
  private async change(
    id: number,
    revision: number,
    edit?: { article: string; title: string; sourceUrl: string },
  ) {
    if (
      !Number.isSafeInteger(id) ||
      id < 1 ||
      !Number.isSafeInteger(revision) ||
      revision < 0
    )
      throw Error("Versi berita tidak valid");
    const c = await this.db.getConnection();
    try {
      await c.beginTransaction();
      const [rows]: any = await c.query(
        "SELECT * FROM news_articles WHERE id=? FOR UPDATE",
        [id],
      );
      const news: NewsArticle | undefined = rows[0];
      if (
        !news ||
        (currentContentType() &&
          news.content_type_id !== currentContentType()!.id)
      )
        throw Error("Berita tidak ditemukan");
      if (news.attempts !== revision)
        throw Error(
          "Berita sudah berubah. Muat ulang sebelum menyimpan atau menghapus",
        );
      if (news.state === "running" || (edit && news.state !== "completed"))
        throw Error("Tunggu proses artikel berita selesai");
      const [active]: any = await c.query(
        "SELECT id FROM news_media_jobs WHERE news_id=? AND state IN ('queued','running')",
        [id],
      );
      if (active.length)
        throw Error(
          "Tunggu produksi berita selesai sebelum menyunting atau menghapus",
        );
      const [posts]: any = await c.query(
        "SELECT data FROM news_media_outputs WHERE news_id=? AND kind IN ('POST_IG','REELS_IG')",
        [id],
      );
      if (
        posts.some((post: any) =>
          ["processing", "preparing", "publishing", "unknown"].includes(
            JSON.parse(post.data).status,
          ),
        )
      )
        throw Error("Periksa status publikasi Instagram terlebih dahulu");
      const [zernio]: any = await c.query(
        "SELECT status FROM zernio_publications WHERE source_key LIKE ?",
        [`news:${id}:%`],
      );
      if (
        zernio.some(
          (post: any) =>
            !["published", "failed", "cancelled"].includes(post.status),
        )
      )
        throw Error("Tunggu publikasi YouTube/TikTok selesai terlebih dahulu");
      if (edit) {
        if (news.article !== edit.article) {
          const hash = createHash("sha256")
            .update(
              (news.content_type_id && news.content_type_id !== 2
                ? `${news.content_type_id}:`
                : "") + newsSourceKey(edit.sourceUrl).url,
            )
            .digest("hex");
          await c.query(
            "UPDATE news_articles SET title=?,article=?,source_url=?,source_hash=?,attempts=attempts+1,candidates=NULL,artifacts=NULL,error=NULL,lease=0 WHERE id=?",
            [edit.title, edit.article, edit.sourceUrl, hash, id],
          );
        }
      } else {
        // Keep shared assets and external publication history; remove owned production records.
        await c.query("DELETE FROM news_stock WHERE news_id=?", [id]);
        await c.query("DELETE FROM news_media_outputs WHERE news_id=?", [id]);
        await c.query("DELETE FROM news_media_jobs WHERE news_id=?", [id]);
        await c.query("DELETE FROM news_articles WHERE id=?", [id]);
      }
      await c.commit();
    } catch (error) {
      await c.rollback();
      throw error;
    } finally {
      c.release();
    }
  }
  async save(id: number, article: unknown, revision: number) {
    if (typeof article !== "string" || article.length > 100000)
      throw Error("Isi artikel berita tidak valid");
    const text = article.replace(/\r\n/g, "\n").trim();
    const validation = validateNewsArticle(text);
    if (!validation.ok || validation.title.length > 500)
      throw Error(
        validation.errors.join("; ") || "Judul maksimal 500 karakter",
      );
    await this.change(id, revision, {
      article: text,
      title: validation.title,
      sourceUrl: validation.sourceUrl!,
    });
  }
  async remove(id: number, revision: number) {
    await this.change(id, revision);
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
      .update(
        (j.content_type_id && j.content_type_id !== 2
          ? `${j.content_type_id}:`
          : "") + newsSourceKey(v.sourceUrl!).url,
      )
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
