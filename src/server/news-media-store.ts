import { labImageKind } from "./lab-image-types";
import { validateLabSettings } from "./lab-production";
import {
  currentContentType,
  ContentTypeStore,
  contentAllows,
} from "./content-types";
import type mysql from "mysql2/promise";
import {
  normalizeBookSettings,
  isStockKind,
  baseKind,
  DEFAULT_BOOK_SETTINGS,
  type BookSettings,
} from "./book-settings";
import { validateNewsArticle } from "./news";
import type { NewsArticle } from "./news-store";
import {
  NEWS_MEDIA_KINDS,
  emptyNewsProduction,
  newsPrerequisite,
  newsContent,
  newsStageDone,
  type NewsProductionData,
  type NewsMediaJob,
} from "./news-production-domain";
type Db = mysql.Pool | mysql.PoolConnection;
export class NewsMediaStore {
  constructor(readonly db: mysql.Pool) {}
  async settings(
    category = "teknologi",
    db: Db = this.db,
    typeId = currentContentType()?.id ?? 2,
  ): Promise<BookSettings> {
    if (category !== "teknologi") throw Error("Jenis berita tidak dikenal");
    const type = await new ContentTypeStore(this.db).get(typeId);
    if (type.settings) return type.settings;
    const [rows]: any = await db.query(
      "SELECT settings FROM news_content_settings WHERE category=?",
      [category],
    );
    return rows.length
      ? normalizeBookSettings(JSON.parse(rows[0].settings))
      : normalizeBookSettings({
          ...DEFAULT_BOOK_SETTINGS,
          stockKinds: ["IMAGE_HORIZONTAL", "IMAGE_VERTICAL"],
          sentenceKinds: ["IMAGE_HORIZONTAL", "IMAGE_VERTICAL"],
          sentenceVideoKind: "IMAGE_VERTICAL",
          sentenceVideoHKind: "IMAGE_HORIZONTAL",
        });
  }
  async saveSettings(category: string, input: unknown) {
    if (category !== "teknologi") throw Error("Jenis berita tidak dikenal");
    const s = normalizeBookSettings(input);
    await validateLabSettings(this.db, s, "news");
    const type = currentContentType();
    if (type && (type.id !== 2 || type.settings)) {
      return (
        await new ContentTypeStore(this.db).save(
          { ...type, settings: s },
          type.id,
        )
      ).settings!;
    }
    await this.db.query(
      "INSERT INTO news_content_settings(category,settings) VALUES(?,?) ON DUPLICATE KEY UPDATE settings=VALUES(settings)",
      [category, JSON.stringify(s)],
    );
    return s;
  }
  async detail(
    id: number,
    revision: number,
    db: Db = this.db,
  ): Promise<NewsProductionData> {
    const p = emptyNewsProduction();
    const [outputs]: any = await db.query(
      "SELECT kind,data FROM news_media_outputs WHERE news_id=? AND revision=?",
      [id, revision],
    );
    for (const o of outputs) p.outputs[o.kind] = JSON.parse(o.data);
    const [jobs]: any = await db.query(
      "SELECT * FROM news_media_jobs WHERE news_id=? AND revision=? ORDER BY id DESC",
      [id, revision],
    );
    p.jobs = jobs;
    const [stock]: any = await db.query(
      "SELECT s.kind,s.panel,s.asset_id,a.file,a.description FROM news_stock s JOIN assets a ON a.id=s.asset_id WHERE s.news_id=? AND s.revision=? ORDER BY s.kind,s.panel",
      [id, revision],
    );
    p.stock = stock;
    return p;
  }
  async enqueue(id: number, kind: string, replace = false) {
    return (await this.enqueueMany(id, [kind], replace))[0];
  }
  async enqueueMany(id: number, kinds: string[], replace = false) {
    if (
      !kinds.length ||
      new Set(kinds).size !== kinds.length ||
      kinds.some(
        (kind) =>
          !NEWS_MEDIA_KINDS.includes(kind) && !isStockKind(baseKind(kind)),
      )
    )
      throw Error("Jenis produksi berita tidak dikenal");
    const c = await this.db.getConnection();
    try {
      await c.beginTransaction();
      const [rows]: any = await c.query(
        "SELECT * FROM news_articles WHERE id=? FOR UPDATE",
        [id],
      );
      const n: NewsArticle = rows[0];
      if (!n || n.state !== "completed")
        throw Error("Butuh artikel berita selesai yang valid");
      const [active]: any = await c.query(
        "SELECT * FROM news_media_jobs WHERE news_id=? AND state IN ('queued','running')",
        [id],
      );
      if (active.some((j: any) => kinds.includes(j.kind)))
        throw Error("Tahap berita ini sudah dalam antrean");
      if (replace && active.length)
        throw Error(
          "Tunggu seluruh produksi berita ini selesai sebelum regenerate",
        );
      const settings = await this.settings(
        n.category,
        c,
        n.content_type_id ?? 2,
      );
      if (!validateNewsArticle(n.article, settings.articleConfig).ok)
        throw Error("Format artikel berita tidak valid");
      const type = await new ContentTypeStore(this.db).get(
        n.content_type_id ?? 2,
      );
      if (kinds.some((kind) => !contentAllows(type, kind)))
        throw Error("Tahap tidak digunakan oleh jenis konten ini");
      for (const kind of kinds)
        if (
          labImageKind(kind) &&
          !(
            kind.startsWith("S_") ? settings.sentenceKinds : settings.stockKinds
          ).includes(baseKind(kind))
        )
          throw Error("Jenis gambar Lab belum diaktifkan");
      await validateLabSettings(this.db, settings, "news");
      const p = await this.detail(id, n.attempts, c);
      const ids: number[] = [];
      for (const kind of kinds) {
        if (!replace && kind.includes("IMAGE_")) {
          const expected = kind.startsWith("S_")
            ? newsContent(n.article).sentences.length
            : 4;
          if (p.stock.filter((b) => b.kind === kind).length >= expected)
            continue;
        }
        if (
          !replace &&
          !["POST_IG", "REELS_IG"].includes(kind) &&
          p.outputs[kind] &&
          newsStageDone(kind, p, settings, n.article)
        )
          throw Error("Hasil tahap sudah tersedia; gunakan regenerate");
        const reason = newsPrerequisite(kind, p, settings, n.article);
        if (reason) throw Error(reason);
        if (["POST_IG", "REELS_IG"].includes(kind)) {
          const status = p.outputs[kind]?.status;
          if (
            status &&
            status !== "failed" &&
            !(replace && status === "published")
          )
            throw Error("Publikasi sudah dikirim; periksa status Instagram");
        }
        if (replace && kind.includes("IMAGE_"))
          await c.query(
            "DELETE FROM news_stock WHERE news_id=? AND revision=? AND kind=?",
            [id, n.attempts, kind],
          );
        const [r]: any = await c.query(
          "INSERT INTO news_media_jobs(news_id,revision,kind,settings,force_new) VALUES(?,?,?,?,?)",
          [id, n.attempts, kind, JSON.stringify(settings), replace ? 1 : 0],
        );
        ids.push(r.insertId);
      }
      await c.commit();
      return ids;
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }
  }
  async claim(now = Date.now()): Promise<NewsMediaJob | undefined> {
    await this.db.query(
      "UPDATE news_media_jobs SET state='failed',error='Proses terhenti; coba ulang secara manual',lease=0 WHERE state='running' AND lease<?",
      [now],
    );
    const c = await this.db.getConnection();
    try {
      await c.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await c.beginTransaction();
      // Lock the owner row: only one media job per article across all workers.
      const [owners]: any = await c.query(
        "SELECT n.id FROM news_articles n WHERE n.state='completed' AND EXISTS(SELECT 1 FROM news_media_jobs j WHERE j.news_id=n.id AND j.revision=n.attempts AND j.state='queued') AND NOT EXISTS(SELECT 1 FROM news_media_jobs r WHERE r.news_id=n.id AND r.state='running') ORDER BY n.id LIMIT 1 FOR UPDATE SKIP LOCKED",
      );
      if (!owners.length) {
        await c.commit();
        return;
      }
      const id = owners[0].id;
      const [active]: any = await c.query(
        "SELECT id FROM news_media_jobs WHERE news_id=? AND state='running'",
        [id],
      );
      if (active.length) {
        await c.commit();
        return;
      }
      const [jobs]: any = await c.query(
        "SELECT j.* FROM news_media_jobs j JOIN news_articles n ON n.id=j.news_id AND n.attempts=j.revision WHERE j.news_id=? AND j.state='queued' ORDER BY j.id LIMIT 1 FOR UPDATE",
        [id],
      );
      const j: NewsMediaJob = jobs[0];
      if (j) {
        j.state = "running";
        j.attempts++;
        j.lease = now + 300000;
        await c.query(
          "UPDATE news_media_jobs SET state='running',attempts=attempts+1,lease=? WHERE id=?",
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
  async heartbeat(j: NewsMediaJob) {
    await this.db.query(
      "UPDATE news_media_jobs SET lease=? WHERE id=? AND state='running' AND attempts=?",
      [Date.now() + 300000, j.id, j.attempts],
    );
  }
  async withCurrent(
    j: NewsMediaJob,
    fn: (db: mysql.PoolConnection) => Promise<void>,
  ) {
    const c = await this.db.getConnection();
    try {
      await c.beginTransaction();
      const [news]: any = await c.query(
        "SELECT attempts,state FROM news_articles WHERE id=? FOR UPDATE",
        [j.news_id],
      );
      const [jobs]: any = await c.query(
        "SELECT state,attempts FROM news_media_jobs WHERE id=? FOR UPDATE",
        [j.id],
      );
      if (
        news[0]?.attempts !== j.revision ||
        news[0]?.state !== "completed" ||
        jobs[0]?.state !== "running" ||
        jobs[0]?.attempts !== j.attempts
      ) {
        await c.rollback();
        return false;
      }
      await fn(c);
      await c.commit();
      return true;
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }
  }
  async bind(j: NewsMediaJob, panel: number, asset: number) {
    return this.withCurrent(j, async (c) => {
      await c.query(
        "REPLACE INTO news_stock(news_id,revision,kind,panel,asset_id) VALUES(?,?,?,?,?)",
        [j.news_id, j.revision, j.kind, panel, asset],
      );
    });
  }
  async output(j: NewsMediaJob, data: any) {
    return this.withCurrent(j, async (c) => {
      await c.query(
        "REPLACE INTO news_media_outputs(news_id,revision,kind,data) VALUES(?,?,?,?)",
        [j.news_id, j.revision, j.kind, JSON.stringify(data)],
      );
    });
  }
  async complete(j: NewsMediaJob, data?: any) {
    return this.withCurrent(j, async (c) => {
      if (data !== undefined)
        await c.query(
          "REPLACE INTO news_media_outputs(news_id,revision,kind,data) VALUES(?,?,?,?)",
          [j.news_id, j.revision, j.kind, JSON.stringify(data)],
        );
      const invalidate: string[] = [];
      const [existing]: any = await c.query(
        "SELECT kind,data FROM news_media_outputs WHERE news_id=? AND revision=?",
        [j.news_id, j.revision],
      );
      for (const row of existing) {
        const output = JSON.parse(row.data);
        if (
          j.kind === "TTS_KALIMAT" &&
          ["VIDEO_KALIMAT", "VIDEO_KALIMAT_H"].includes(row.kind)
        )
          invalidate.push(row.kind);
        if (
          j.kind.startsWith("S_IMAGE_") &&
          ["VIDEO_KALIMAT", "VIDEO_KALIMAT_H"].includes(row.kind) &&
          `S_${output.source}` === j.kind
        )
          invalidate.push(row.kind);
        if (
          j.kind.startsWith("IMAGE_") &&
          row.kind === "PANEL" &&
          [
            output.sources?.panelHorizontal,
            output.sources?.panelVertical,
          ].includes(j.kind)
        )
          invalidate.push(row.kind);
      }
      for (const k of invalidate)
        await c.query(
          "DELETE FROM news_media_outputs WHERE news_id=? AND revision=? AND kind=?",
          [j.news_id, j.revision, k],
        );
      await c.query(
        "UPDATE news_media_jobs SET state='completed',error=NULL,lease=0 WHERE id=?",
        [j.id],
      );
    });
  }
  async fail(j: NewsMediaJob, error: string) {
    await this.db.query(
      "UPDATE news_media_jobs SET state='failed',error=?,lease=0 WHERE id=? AND state='running' AND attempts=?",
      [error, j.id, j.attempts],
    );
  }
  async pendingPublications() {
    const [rows]: any = await this.db.query(
      "SELECT * FROM news_media_outputs WHERE kind IN ('POST_IG','REELS_IG')",
    );
    return rows.filter((r: any) =>
      ["preparing", "processing", "publishing"].includes(
        JSON.parse(r.data).status,
      ),
    );
  }
  async updatePublication(
    id: number,
    kind: string,
    requestId: string,
    result: any,
  ) {
    // Compare request ID inside SQL so a late poll cannot overwrite a newer request.
    await this.db.query(
      "UPDATE news_media_outputs SET data=? WHERE news_id=? AND kind=? AND JSON_UNQUOTE(JSON_EXTRACT(data,'$.requestId'))=?",
      [JSON.stringify(result), id, kind, requestId],
    );
  }
}
