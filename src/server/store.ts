import mysql from "mysql2/promise";
import {
  validateArticle,
  roundRobin,
  canStart,
  bookKey,
  articleSentences,
  partNumber,
  PANEL_COUNT,
} from "./domain";
import {
  STOCK_KINDS,
  SENTENCE_KINDS,
  DEFAULT_BOOK_SETTINGS,
  normalizeBookSettings,
  panelSources,
  type BookSettings,
} from "./book-settings";
import { dbConfig } from "./config";
export interface Chapter {
  id: number;
  book: string;
  title: string;
  part_number: number | null;
  article: string;
  article_status: string;
  visual_status: string;
  panel_status: string;
  production_status: string;
  instagram_status: string;
  post_status: string;
  post_request_id: string | null;
  post_media_id: string | null;
  reels_status: string;
  reels_request_id: string | null;
  reels_media_id: string | null;
  revision: number;
  preview: string | null;
  report: string | null;
  quote: string | null;
  quote_image: string | null;
  sentence_audio: string | null;
  sentence_video: string | null;
  sentence_video_h: string | null;
  panels: string | null;
  created_at: string;
  stock_counts?: Record<string, number>;
}
export interface Job {
  id: number;
  chapter_id: number;
  kind: string;
  state: string;
  attempts: number;
  lease: number;
  revision: number;
  force_new: number;
  error: string | null;
}
export interface Asset {
  id: number;
  kind: string;
  file: string;
  description: string;
  prompt: string | null;
  created_at: string;
  usage: number;
}
export interface Binding {
  kind: string;
  panel: number;
  asset_id: number;
  file: string;
  description: string;
}
export interface User {
  id: number;
  email: string;
  password_hash: string;
}
type Db = mysql.Pool | mysql.PoolConnection;
const JOB_COLUMNS =
  "id,chapter_id,kind,state,attempts,lease,revision,force_new,error";
async function rows<T>(db: Db, sql: string, params: unknown[] = []) {
  const [result] = await db.query(sql, params);
  return result as T[];
}
async function run(db: Db, sql: string, params: unknown[] = []) {
  const [result] = await db.query(sql, params);
  return result as mysql.ResultSetHeader;
}
// Tabel dibuat lewat scripts/db-setup.ts (root); aplikasi hanya membaca/menulis.
export class Store {
  db: mysql.Pool;
  constructor(config = dbConfig()) {
    this.db = mysql.createPool({
      ...config,
      charset: "utf8mb4",
      connectionLimit: 5,
      supportBigNumbers: true,
    });
  }
  close() {
    return this.db.end();
  }
  private async tx<T>(fn: (db: mysql.PoolConnection) => Promise<T>) {
    const conn = await this.db.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
  userByEmail(email: string) {
    return rows<User>(this.db, "SELECT * FROM users WHERE email=?", [
      email.trim().toLowerCase(),
    ]).then((r) => r[0]);
  }
  async create(book: string, title: string) {
    book = book.replace(/\s+/g, " ").trim();
    title = title.replace(/\s+/g, " ").trim();
    if (!book || !title) throw Error("Judul buku dan judul bagian wajib diisi");
    if (book.length > 255 || title.length > 500)
      throw Error("Judul terlalu panjang");
    // Nomor bagian berikutnya dalam buku ini (tidak bentrok dengan yang ada).
    const [{ next }] = await rows<{ next: number }>(
      this.db,
      "SELECT GREATEST(COALESCE(MAX(part_number),0),COUNT(*))+1 AS next FROM chapters WHERE book=?",
      [book],
    );
    return (
      await run(
        this.db,
        "INSERT INTO chapters(book,title,part_number,article) VALUES(?,?,?,'')",
        [book, title, Number(next)],
      )
    ).insertId;
  }
  // Ubah nomor bagian. Bila nomor itu dipakai bagian lain di buku yang sama,
  // keduanya bertukar nomor. Footer panel dan label slide pembuka video memuat
  // nomor, jadi panel dan video bagian yang berubah dibuang.
  async setPartNumber(id: number, part: number) {
    if (!Number.isInteger(part) || part < 1 || part > 9999)
      throw Error("Nomor bagian harus bilangan bulat 1–9999");
    return this.tx(async (db) => {
      const c = await this.chapter(id, db);
      if (!c) throw Error("Bagian tidak ditemukan");
      const same = await rows<Chapter>(
        db,
        "SELECT * FROM chapters WHERE book=? ORDER BY id FOR UPDATE",
        [c.book],
      );
      const current = partNumber(same, same.find((x) => x.id === id)!);
      if (current === part) return { id, part, swapped: null as number | null };
      const other = same.find(
        (x) => x.id !== id && partNumber(same, x) === part,
      );
      const ids = [id, ...(other ? [other.id] : [])];
      const [busy] = await rows<{ n: number }>(
        db,
        "SELECT COUNT(*) AS n FROM jobs WHERE chapter_id IN (?) AND state IN ('queued','running')",
        [ids],
      );
      if (Number(busy.n))
        throw Error("Masih ada job aktif untuk bagian ini; tunggu selesai");
      await run(db, "UPDATE chapters SET part_number=? WHERE id=?", [part, id]);
      if (other)
        await run(db, "UPDATE chapters SET part_number=? WHERE id=?", [
          current,
          other.id,
        ]);
      await run(
        db,
        "UPDATE chapters SET panel_status='belum',panels=NULL,sentence_video=NULL,sentence_video_h=NULL WHERE id IN (?)",
        [ids],
      );
      return { id, part, swapped: other?.id ?? null };
    });
  }
  // Hapus bab beserta job dan ikatan stoknya; gambar tetap di kolam.
  async remove(id: number) {
    await this.tx(async (db) => {
      const c = await this.chapter(id, db);
      if (!c) throw Error("Bagian tidak ditemukan");
      await run(db, "DELETE FROM chapter_stock WHERE chapter_id=?", [id]);
      await run(db, "DELETE FROM jobs WHERE chapter_id=?", [id]);
      await run(db, "DELETE FROM chapters WHERE id=?", [id]);
      // Nomor bagian lain tidak bergeser (tersimpan per bagian), jadi panel
      // dan video bagian lain tetap berlaku.
    });
  }
  // stock_counts: jumlah panel terikat per lajur stok (syarat ✓ Gambar dan Panel).
  async list() {
    const chapters = await rows<Chapter>(
      this.db,
      "SELECT * FROM chapters ORDER BY id",
    );
    const counts = await rows<{ chapter_id: number; kind: string; n: number }>(
      this.db,
      "SELECT chapter_id,kind,COUNT(*) AS n FROM chapter_stock GROUP BY chapter_id,kind",
    );
    for (const c of chapters)
      c.stock_counts = Object.fromEntries(
        counts
          .filter((x) => x.chapter_id === c.id)
          .map((x) => [x.kind, Number(x.n)]),
      );
    return chapters;
  }
  // Pengaturan konten per buku; buku tanpa baris memakai bawaan.
  async bookSettings(book: string, db: Db = this.db): Promise<BookSettings> {
    const row = (
      await rows<{ settings: string }>(
        db,
        "SELECT settings FROM book_settings WHERE book_key=?",
        [bookKey(book)],
      )
    )[0];
    if (!row) return DEFAULT_BOOK_SETTINGS;
    try {
      return normalizeBookSettings(JSON.parse(row.settings));
    } catch {
      return DEFAULT_BOOK_SETTINGS;
    }
  }
  async saveBookSettings(book: string, input: unknown) {
    if (!bookKey(book)) throw Error("Judul buku wajib diisi");
    const settings = normalizeBookSettings(input);
    await run(
      this.db,
      "REPLACE INTO book_settings(book_key,settings) VALUES(?,?)",
      [bookKey(book), JSON.stringify(settings)],
    );
    return settings;
  }
  async chapter(id: number, db: Db = this.db) {
    return (
      await rows<Chapter>(db, "SELECT * FROM chapters WHERE id=?", [id])
    )[0];
  }
  async nextChapter() {
    return roundRobin(
      (await this.list()).filter((x) => x.article_status !== "siap"),
    )[0];
  }
  async save(id: number, article: string) {
    if (!(await this.chapter(id))) throw Error("Bagian tidak ditemukan");
    await this.tx(async (db) => {
      await run(
        db,
        "UPDATE jobs SET state='cancelled' WHERE chapter_id=? AND state IN ('queued','running')",
        [id],
      );
      await run(
        db,
        "UPDATE chapters SET article=?,article_status=?,revision=revision+1,quote=NULL,quote_image=NULL,sentence_audio=NULL,sentence_video=NULL,sentence_video_h=NULL,preview=NULL,report=NULL,visual_status='belum',panel_status='belum',panels=NULL,production_status='belum' WHERE id=?",
        [
          article,
          validateArticle(article).ok ? "menunggu editor" : "draft",
          id,
        ],
      );
      await run(db, "DELETE FROM chapter_stock WHERE chapter_id=?", [id]);
    });
  }
  async enqueue(id: number, kind: string, replace = false) {
    const c = await this.chapter(id);
    if (!c) throw Error("Bagian tidak ditemukan");
    if (
      ![
        "ARTICLE",
        "PREVIEW",
        "EDITOR",
        ...STOCK_KINDS,
        ...SENTENCE_KINDS,
        "PANEL",
        "POST_IG",
        "QUOTE",
        "QUOTE_IMAGE",
        "REELS_IG",
        "TTS_KALIMAT",
        "VIDEO_KALIMAT",
        "VIDEO_KALIMAT_H",
      ].includes(kind)
    )
      throw Error("Jenis job ditolak");
    if (kind === "ARTICLE" && c.article && !replace)
      throw Error("Artikel sudah ada; regenerasi eksplisit diperlukan");
    if (/^(S_)?IMAGE_/.test(kind) && c.article_status !== "siap")
      throw Error("Review editorial harus lolos sebelum stok gambar");
    if (kind === "PANEL") {
      const settings = await this.bookSettings(c.book);
      for (const source of panelSources(settings))
        if ((await this.stock(id, source)).length < PANEL_COUNT)
          throw Error("Render panel butuh enam stok gambar " + source);
    }
    if (kind === "QUOTE_IMAGE" && !c.quote)
      throw Error("Gambar quote butuh quote");
    if (kind === "QUOTE" && !validateArticle(c.article).ok)
      throw Error("Quote butuh artikel final yang valid");
    if (kind === "POST_IG") {
      if (c.panel_status !== "tersedia")
        throw Error("Post IG butuh panel yang sudah dirender");
      if (["preparing", "processing", "publishing"].includes(c.post_status))
        throw Error("Posting sedang diproses Instagram");
      if (c.post_status === "published")
        throw Error("Bagian ini sudah diposting");
      if (c.post_status === "unknown")
        throw Error(
          "Hasil posting sebelumnya belum pasti; periksa akun Instagram dulu",
        );
    }
    if (kind === "TTS_KALIMAT" && c.article_status !== "siap")
      throw Error("Audio kalimat butuh artikel lolos editor");
    if (kind === "VIDEO_KALIMAT" || kind === "VIDEO_KALIMAT_H") {
      const settings = await this.bookSettings(c.book);
      const source =
        kind === "VIDEO_KALIMAT"
          ? settings.sentenceVideoKind
          : settings.sentenceVideoHKind;
      if (!source)
        throw Error(
          `Pilih sumber gambar Video Kalimat${kind === "VIDEO_KALIMAT_H" ? " H" : ""} di Pengaturan Konten`,
        );
      const n = articleSentences(c.article).length;
      if ((await this.stock(id, "S_" + source)).length < n)
        throw Error("Video kalimat butuh gambar untuk setiap kalimat");
      if (!c.sentence_audio)
        throw Error("Video kalimat butuh audio per kalimat");
    }
    if (kind === "REELS_IG") {
      if (!c.sentence_video)
        throw Error("Reels IG butuh Video yang sudah dirender");
      if (["preparing", "processing", "publishing"].includes(c.reels_status))
        throw Error("Reels sedang diproses Instagram");
      if (c.reels_status === "published")
        throw Error("Reels bagian ini sudah diposting");
      if (c.reels_status === "unknown")
        throw Error(
          "Hasil Reels sebelumnya belum pasti; periksa akun Instagram dulu",
        );
    }
    if (kind === "PREVIEW" && !validateArticle(c.article).ok)
      throw Error("Artikel belum valid");
    // Regenerate stok: ikatan lajur ini dilepas dan job memaksa gambar baru.
    const regenerate = /^(S_)?IMAGE_/.test(kind) && replace;
    try {
      return await this.tx(async (db) => {
        const jobId = (
          await run(
            db,
            "INSERT INTO jobs(chapter_id,kind,state,revision,force_new) VALUES(?,?,'queued',?,?)",
            [id, kind, c.revision, regenerate ? 1 : 0],
          )
        ).insertId;
        if (
          regenerate &&
          panelSources(await this.bookSettings(c.book, db)).includes(kind)
        ) {
          await run(
            db,
            "UPDATE chapters SET panel_status='belum',panels=NULL WHERE id=?",
            [id],
          );
        }
        if (regenerate && kind.startsWith("S_"))
          await run(
            db,
            "UPDATE chapters SET sentence_video=NULL,sentence_video_h=NULL WHERE id=?",
            [id],
          );
        if (regenerate) {
          await run(
            db,
            "DELETE FROM chapter_stock WHERE chapter_id=? AND kind=?",
            [id, kind],
          );
        }
        return jobId;
      });
    } catch (e) {
      if ((e as { code?: string }).code === "ER_DUP_ENTRY")
        throw Error("Job aktif sudah ada");
      throw e;
    }
  }
  jobs() {
    return rows<Job>(
      this.db,
      `SELECT ${JOB_COLUMNS} FROM jobs ORDER BY id DESC LIMIT 100`,
    );
  }
  claim(now = Date.now()) {
    return this.tx(async (db) => {
      // Job antre tertua yang tidak bentrok dengan job aktif bagian yang sama.
      const active = await rows<Job>(
        db,
        `SELECT ${JOB_COLUMNS} FROM jobs WHERE state IN ('queued','running') ORDER BY id FOR UPDATE`,
      );
      const j = active.find((x) => x.state === "queued" && canStart(x, active));
      if (j) {
        await run(
          db,
          "UPDATE jobs SET state='running',attempts=attempts+1,lease=? WHERE id=?",
          [now + 300000, j.id],
        );
        j.state = "running";
        j.attempts++;
        j.lease = now + 300000;
      }
      return j;
    });
  }
  async heartbeat(id: number, now = Date.now()) {
    await run(
      this.db,
      "UPDATE jobs SET lease=? WHERE id=? AND state='running'",
      [now + 300000, id],
    );
  }
  async recover(now = Date.now()) {
    await run(
      this.db,
      "UPDATE jobs SET state=CASE WHEN attempts>=2 THEN 'failed' ELSE 'queued' END,error='Lease expired; proses terhenti' WHERE state='running' AND lease<?",
      [now],
    );
  }
  async fail(id: number, error: string) {
    await run(
      this.db,
      "UPDATE jobs SET state='failed',error=? WHERE id=? AND state='running'",
      [error, id],
    );
  }
  // Status posting dari NC-WA; dipakai job POST_IG dan pemantauan worker.
  async setPost(
    id: number,
    post: { status: string; requestId: string; mediaId?: string | null },
  ) {
    await run(
      this.db,
      "UPDATE chapters SET post_status=?,post_request_id=?,post_media_id=? WHERE id=?",
      [post.status, post.requestId, post.mediaId ?? null, id],
    );
  }
  async setReels(
    id: number,
    post: { status: string; requestId: string; mediaId?: string | null },
  ) {
    await run(
      this.db,
      "UPDATE chapters SET reels_status=?,reels_request_id=?,reels_media_id=? WHERE id=?",
      [post.status, post.requestId, post.mediaId ?? null, id],
    );
  }
  pendingReels() {
    return rows<Chapter>(
      this.db,
      "SELECT * FROM chapters WHERE reels_status IN ('preparing','processing','publishing') AND reels_request_id IS NOT NULL",
    );
  }
  pendingPosts() {
    return rows<Chapter>(
      this.db,
      "SELECT * FROM chapters WHERE post_status IN ('preparing','processing','publishing') AND post_request_id IS NOT NULL",
    );
  }
  // Kolam stok per jenis; usage = jumlah ikatan bab saat ini.
  assets(kind: string) {
    return rows<Asset>(
      this.db,
      "SELECT a.*,(SELECT COUNT(*) FROM chapter_stock s WHERE s.asset_id=a.id) AS `usage` FROM assets a WHERE a.kind=? ORDER BY a.id",
      [kind],
    );
  }
  async assetById(id: number) {
    return (
      await rows<Asset>(this.db, "SELECT * FROM assets WHERE id=?", [id])
    )[0];
  }
  async assetByFile(file: string) {
    return (
      await rows<Asset>(this.db, "SELECT * FROM assets WHERE file=?", [file])
    )[0];
  }
  async addAsset(
    kind: string,
    file: string,
    description: string,
    prompt: string,
  ) {
    return (
      await run(
        this.db,
        "INSERT INTO assets(kind,file,description,prompt) VALUES(?,?,?,?)",
        [kind, file, description, prompt],
      )
    ).insertId;
  }
  stock(chapterId: number, kind?: string) {
    return rows<Binding>(
      this.db,
      "SELECT s.kind,s.panel,s.asset_id,a.file,a.description FROM chapter_stock s JOIN assets a ON a.id=s.asset_id WHERE s.chapter_id=? AND (? IS NULL OR s.kind=?) ORDER BY s.kind,s.panel",
      [chapterId, kind ?? null, kind ?? null],
    );
  }
  // Ikatan hanya ditulis bila job masih berjalan pada revisi artikel yang sama.
  bind(jobId: number, panel: number, assetId: number) {
    return this.tx(async (db) => {
      const j = (
        await rows<Job>(
          db,
          `SELECT ${JOB_COLUMNS} FROM jobs WHERE id=? FOR UPDATE`,
          [jobId],
        )
      )[0];
      const c = j && (await this.chapter(j.chapter_id, db));
      const ok = !!c && j.state === "running" && c.revision === j.revision;
      if (ok)
        await run(
          db,
          "REPLACE INTO chapter_stock(chapter_id,kind,panel,asset_id) VALUES(?,?,?,?)",
          [c.id, j.kind, panel, assetId],
        );
      return ok;
    });
  }
  complete(
    id: number,
    result: {
      article?: string;
      preview?: string;
      report?: string;
      visual?: string;
      panels?: string;
      quote?: string;
      quoteImage?: string;
      sentenceAudio?: string;
      sentenceVideo?: string;
      sentenceVideoH?: string;
    },
  ) {
    return this.tx(async (db) => {
      const j = (
        await rows<Job>(
          db,
          `SELECT ${JOB_COLUMNS} FROM jobs WHERE id=? FOR UPDATE`,
          [id],
        )
      )[0];
      const c = j && (await this.chapter(j.chapter_id, db));
      if (!j || !c || j.state !== "running" || c.revision !== j.revision) {
        await run(
          db,
          "UPDATE jobs SET state='cancelled',error='Snapshot artikel berubah' WHERE id=? AND state='running'",
          [id],
        );
        return false;
      }
      if (result.article !== undefined) {
        await run(
          db,
          "UPDATE chapters SET article=?,revision=revision+1,quote=NULL,quote_image=NULL,sentence_audio=NULL,sentence_video=NULL,sentence_video_h=NULL,article_status='menunggu editor',report=NULL,preview=NULL,visual_status='belum',panel_status='belum',panels=NULL,production_status='belum' WHERE id=?",
          [result.article, c.id],
        );
        await run(db, "DELETE FROM chapter_stock WHERE chapter_id=?", [c.id]);
        await run(
          db,
          "UPDATE jobs SET state='cancelled',error='Artikel diregenerasi' WHERE chapter_id=? AND id<>? AND state='queued'",
          [c.id, id],
        );
      }
      if (result.preview)
        await run(db, "UPDATE chapters SET preview=? WHERE id=?", [
          result.preview,
          c.id,
        ]);
      // Stok sumber panel buku ini berubah → panel lama tidak lagi sesuai.
      if (result.visual)
        await run(
          db,
          !panelSources(await this.bookSettings(c.book, db)).includes(j.kind)
            ? "UPDATE chapters SET visual_status=? WHERE id=?"
            : "UPDATE chapters SET visual_status=?,panel_status='belum',panels=NULL WHERE id=?",
          [result.visual, c.id],
        );
      // Quote baru → gambar quote lama tidak lagi sesuai.
      if (result.quote !== undefined)
        await run(
          db,
          "UPDATE chapters SET quote=?,quote_image=NULL WHERE id=?",
          [result.quote, c.id],
        );
      if (result.sentenceAudio !== undefined)
        await run(
          db,
          "UPDATE chapters SET sentence_audio=?,sentence_video=NULL,sentence_video_h=NULL WHERE id=?",
          [result.sentenceAudio, c.id],
        );
      if (result.sentenceVideo !== undefined)
        await run(db, "UPDATE chapters SET sentence_video=? WHERE id=?", [
          result.sentenceVideo,
          c.id,
        ]);
      if (result.sentenceVideoH !== undefined)
        await run(db, "UPDATE chapters SET sentence_video_h=? WHERE id=?", [
          result.sentenceVideoH,
          c.id,
        ]);
      if (result.quoteImage !== undefined)
        await run(db, "UPDATE chapters SET quote_image=? WHERE id=?", [
          result.quoteImage,
          c.id,
        ]);
      if (result.panels)
        await run(
          db,
          "UPDATE chapters SET panels=?,panel_status='tersedia' WHERE id=?",
          [result.panels, c.id],
        );
      if (result.report) {
        const r = JSON.parse(result.report);
        await run(
          db,
          "UPDATE chapters SET report=?,article_status=? WHERE id=?",
          [result.report, r.lolos ? "siap" : "revisi", c.id],
        );
      }
      await run(db, "UPDATE jobs SET state='completed',error=NULL WHERE id=?", [
        id,
      ]);
      return true;
    });
  }
}
