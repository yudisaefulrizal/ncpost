import {
  currentContentType,
  ContentTypeStore,
  contentAllows,
} from "./content-types";
import mysql from "mysql2/promise";
import {
  CRON_TYPES,
  intervalDue,
  cronJobs,
  normalizeCron,
  type BookCron,
} from "./cron";
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
import {
  moveChapterOutputs,
  removeChapterOutputs,
  type ChapterRef,
} from "./output-paths";
export interface Chapter {
  content_type_id?: number;
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
  text_image?: string | null;
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
      "SELECT GREATEST(COALESCE(MAX(part_number),0),COUNT(*))+1 AS next FROM chapters WHERE book=? AND content_type_id=?",
      [book, currentContentType()?.id ?? 1],
    );
    return (
      await run(
        this.db,
        "INSERT INTO chapters(book,title,part_number,article,content_type_id) VALUES(?,?,?,'',?)",
        [book, title, Number(next), currentContentType()?.id ?? 1],
      )
    ).insertId;
  }
  // Impor dari JSON [{ "buku": "...", "tema": "..." }]: buku = judul buku,
  // tema = judul bagian. Berurutan sesuai file; nomor bagian melanjutkan nomor
  // terbesar di bukunya. Entri yang sudah ada (buku + judul sama, tanpa beda
  // huruf besar/kecil dan spasi) dilewati, jadi aman diulang. Semua entri
  // divalidasi dulu; satu yang salah membatalkan seluruh impor. dryRun = hitung
  // saja, tanpa menulis.
  async importChapters(items: unknown, dryRun = false) {
    if (!Array.isArray(items)) throw Error("File harus berisi array JSON");
    if (!items.length) throw Error("File tidak berisi entri");
    if (items.length > 500) throw Error("Maksimal 500 bagian per impor");
    const clean = items.map((x: any, i) => {
      const book =
        typeof x?.buku === "string" ? x.buku.replace(/\s+/g, " ").trim() : "";
      const title =
        typeof x?.tema === "string" ? x.tema.replace(/\s+/g, " ").trim() : "";
      if (!book || !title)
        throw Error(`Entri ${i + 1}: "buku" dan "tema" wajib berupa teks`);
      if (book.length > 255 || title.length > 500)
        throw Error(`Entri ${i + 1}: judul terlalu panjang`);
      return { book, title };
    });
    return this.tx(async (db) => {
      const existing = await rows<Chapter>(
        db,
        "SELECT book,title,part_number FROM chapters WHERE content_type_id=? FOR UPDATE",
        [currentContentType()?.id ?? 1],
      );
      const seen = new Set(
        existing.map((x) => bookKey(x.book) + "\n" + bookKey(x.title)),
      );
      // Ejaan buku yang sudah ada dipakai ulang; nomor berikutnya per buku.
      const spelling = new Map<string, string>();
      const next = new Map<string, number>();
      for (const x of existing) {
        const key = bookKey(x.book);
        if (!spelling.has(key)) spelling.set(key, x.book);
        next.set(
          key,
          Math.max((next.get(key) ?? 0) + 1, Number(x.part_number ?? 0) + 1),
        );
      }
      const fresh: [string, string, number, string, number][] = [];
      let skipped = 0;
      for (const { book, title } of clean) {
        const key = bookKey(book);
        const id = key + "\n" + bookKey(title);
        if (seen.has(id)) {
          skipped++;
          continue;
        }
        seen.add(id);
        if (!spelling.has(key)) spelling.set(key, book);
        const part = next.get(key) ?? 1;
        next.set(key, part + 1);
        fresh.push([
          spelling.get(key)!,
          title,
          part,
          "",
          currentContentType()?.id ?? 1,
        ]);
      }
      if (!dryRun && fresh.length)
        await run(
          db,
          "INSERT INTO chapters(book,title,part_number,article,content_type_id) VALUES ?",
          [fresh],
        );
      return {
        created: fresh.length,
        skipped,
        books: new Set(fresh.map((x) => bookKey(x[0]))).size,
        dryRun,
      };
    });
  }
  // Urutkan ulang nomor satu buku menjadi 1..N tanpa celah (mis. setelah ada
  // bagian yang dihapus), mengikuti urutan nomor sekarang (seri: urutan input).
  // Panel dan video bagian yang nomornya berubah dibuang karena footer dan label
  // slide pembukanya memuat nomor.
  async renumberBook(book: string) {
    const done = await this.tx(async (db) => {
      const all = await rows<Chapter>(
        db,
        "SELECT * FROM chapters WHERE content_type_id=? ORDER BY id FOR UPDATE",
        [currentContentType()?.id ?? 1],
      );
      const same = all
        .filter((x) => bookKey(x.book) === bookKey(book))
        .sort((a, b) => partNumber(all, a) - partNumber(all, b) || a.id - b.id);
      if (!same.length) throw Error("Buku tidak ditemukan");
      const changed = same
        .map((x, i) => ({ id: x.id, part: i + 1, was: partNumber(all, x) }))
        .filter(
          (x) =>
            x.part !== x.was ||
            same.find((c) => c.id === x.id)!.part_number == null,
        );
      const renumbered = changed
        .filter((x) => x.part !== x.was)
        .map((x) => x.id);
      if (renumbered.length) {
        const [busy] = await rows<{ n: number }>(
          db,
          "SELECT COUNT(*) AS n FROM jobs WHERE chapter_id IN (?) AND state IN ('queued','running')",
          [renumbered],
        );
        if (Number(busy.n))
          throw Error(
            "Masih ada job aktif di bagian yang nomornya berubah; tunggu selesai",
          );
      }
      for (const x of changed)
        await run(db, "UPDATE chapters SET part_number=? WHERE id=?", [
          x.part,
          x.id,
        ]);
      if (renumbered.length)
        await run(
          db,
          "UPDATE chapters SET panel_status='belum',panels=NULL,sentence_video=NULL,sentence_video_h=NULL WHERE id IN (?)",
          [renumbered],
        );
      // Folder hasil mengikuti nomor baru (dipindah setelah commit).
      const moves = changed
        .filter((x) => x.part !== x.was)
        .map((x) => {
          const row = same.find((c) => c.id === x.id)!;
          return {
            before: { ...row, part_number: x.was } as ChapterRef,
            after: { ...row, part_number: x.part } as ChapterRef,
          };
        });
      return {
        result: { total: same.length, changed: renumbered.length },
        moves,
      };
    });
    this.moveOutputs(done.moves);
    return done.result;
  }
  // Pemindahan folder tidak boleh menggagalkan perubahan di database.
  private moveOutputs(moves: { before: ChapterRef; after: ChapterRef }[]) {
    try {
      moveChapterOutputs(moves);
    } catch {}
  }
  // Ubah nomor bagian. Bila nomor itu dipakai bagian lain di buku yang sama,
  // keduanya bertukar nomor. Footer panel dan label slide pembuka video memuat
  // nomor, jadi panel dan video bagian yang berubah dibuang.
  async setPartNumber(id: number, part: number) {
    if (!Number.isInteger(part) || part < 1 || part > 9999)
      throw Error("Nomor bagian harus bilangan bulat 1–9999");
    const done = await this.tx(async (db) => {
      const c = await this.chapter(id, db);
      if (!c) throw Error("Bagian tidak ditemukan");
      const same = await rows<Chapter>(
        db,
        "SELECT * FROM chapters WHERE book=? AND content_type_id=? ORDER BY id FOR UPDATE",
        [c.book, c.content_type_id ?? 1],
      );
      const current = partNumber(same, same.find((x) => x.id === id)!);
      if (current === part)
        return {
          result: { id, part, swapped: null as number | null },
          moves: [] as { before: ChapterRef; after: ChapterRef }[],
        };
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
      const mine = same.find((x) => x.id === id)!;
      const moves = [
        {
          before: { ...mine, part_number: current } as ChapterRef,
          after: { ...mine, part_number: part } as ChapterRef,
        },
        ...(other
          ? [
              {
                before: { ...other, part_number: part } as ChapterRef,
                after: { ...other, part_number: current } as ChapterRef,
              },
            ]
          : []),
      ];
      return { result: { id, part, swapped: other?.id ?? null }, moves };
    });
    this.moveOutputs(done.moves);
    return done.result;
  }
  // Hapus bab beserta job dan ikatan stoknya; gambar tetap di kolam.
  async remove(id: number) {
    const gone = await this.tx(async (db) => {
      const c = await this.chapter(id, db);
      if (!c) throw Error("Bagian tidak ditemukan");
      await run(db, "DELETE FROM chapter_stock WHERE chapter_id=?", [id]);
      await run(db, "DELETE FROM jobs WHERE chapter_id=?", [id]);
      await run(db, "DELETE FROM chapters WHERE id=?", [id]);
      // Nomor bagian lain tidak bergeser (tersimpan per bagian), jadi panel
      // dan video bagian lain tetap berlaku.
      return c;
    });
    // Hasil render bagian ini (folder per bagian) ikut dihapus; kolam stok
    // gambar tidak disentuh.
    try {
      removeChapterOutputs(gone);
    } catch {}
  }
  // stock_counts: jumlah panel terikat per lajur stok (syarat ✓ Gambar dan Panel).
  async list() {
    const chapters = await rows<Chapter>(
      this.db,
      currentContentType()
        ? "SELECT * FROM chapters WHERE content_type_id=? ORDER BY id"
        : "SELECT * FROM chapters ORDER BY id",
      currentContentType() ? [currentContentType()!.id] : [],
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
  async bookSettings(
    book: string,
    db: Db = this.db,
    typeId = currentContentType()?.id ?? 1,
  ): Promise<BookSettings> {
    const row = (
      await rows<{ settings: string }>(
        db,
        "SELECT settings FROM book_settings WHERE book_key=? AND content_type_id=?",
        [bookKey(book), typeId],
      )
    )[0];
    if (!row) {
      return (
        (await new ContentTypeStore(this.db).get(typeId)).settings ??
        DEFAULT_BOOK_SETTINGS
      );
    }
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
      "REPLACE INTO book_settings(book_key,settings,content_type_id) VALUES(?,?,?)",
      [bookKey(book), JSON.stringify(settings), currentContentType()?.id ?? 1],
    );
    return settings;
  }
  async bookCrons(): Promise<BookCron[]> {
    const chapters = await this.list();
    let saved: any[];
    let migrationNeeded = false;
    try {
      saved = await rows<any>(
        this.db,
        "SELECT * FROM book_cron WHERE content_type_id=?",
        [currentContentType()?.id ?? 1],
      );
    } catch (e) {
      if ((e as { code?: string }).code !== "ER_NO_SUCH_TABLE") throw e;
      saved = [];
      migrationNeeded = true;
    }
    const books = new Map(chapters.map((c) => [bookKey(c.book), c.book]));
    return [...books].flatMap(([key, book]) =>
      CRON_TYPES.map(([kind]) => {
        const row = saved.find((r) => r.book_key === key && r.kind === kind);
        return {
          book,
          kind,
          enabled: !!row?.enabled,
          intervalHours: Number(row?.interval_hours ?? 24),
          next_run: row?.next_run == null ? null : Number(row.next_run),
          last_tick: row?.last_tick == null ? null : Number(row.last_tick),
          last_result: migrationNeeded
            ? "Tabel cron belum tersedia. Jalankan db:setup dengan akses admin MySQL."
            : (row?.last_result ?? null),
        };
      }),
    );
  }
  async saveBookCron(book: string, input: unknown, now = Date.now()) {
    const key = bookKey(book);
    if (
      key.length > 255 ||
      !(await this.list()).some((c) => bookKey(c.book) === key)
    )
      throw Error("Buku tidak ditemukan");
    const c = normalizeCron(input);
    try {
      await run(
        this.db,
        `INSERT INTO book_cron(book_key,kind,enabled,interval_hours,next_run,content_type_id) VALUES(?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),interval_hours=VALUES(interval_hours),next_run=VALUES(next_run)`,
        [
          key,
          c.kind,
          c.enabled ? 1 : 0,
          c.intervalHours,
          c.enabled ? now + c.intervalHours * 3600000 : null,
          currentContentType()?.id ?? 1,
        ],
      );
    } catch (e) {
      if ((e as { code?: string }).code === "ER_NO_SUCH_TABLE")
        throw Error(
          "Tabel cron belum tersedia. Jalankan db:setup dengan akses admin MySQL.",
        );
      throw e;
    }
    return c;
  }
  async scheduleCrons(now = Date.now()) {
    const tick = Math.floor(now / 60000) * 60000;
    const due = await rows<any>(
      this.db,
      "SELECT * FROM book_cron WHERE enabled=1",
    );
    for (const cron of due) {
      try {
        if (
          Number(cron.last_tick) >= tick ||
          !intervalDue(
            cron.next_run == null ? null : Number(cron.next_run),
            now,
          )
        )
          continue;
        await this.tx(async (db) => {
          const current = (
            await rows<any>(
              db,
              "SELECT * FROM book_cron WHERE book_key=? AND kind=? AND content_type_id=? FOR UPDATE",
              [cron.book_key, cron.kind, cron.content_type_id ?? 1],
            )
          )[0];
          if (
            !current?.enabled ||
            Number(current.last_tick) >= tick ||
            !intervalDue(
              current.next_run == null ? null : Number(current.next_run),
              now,
            )
          )
            return;
          const chapters = (
            await rows<Chapter>(
              db,
              "SELECT * FROM chapters WHERE content_type_id=? ORDER BY COALESCE(part_number,id),id",
              [cron.content_type_id ?? 1],
            )
          ).filter((c) => bookKey(c.book) === cron.book_key);
          let result = "Tidak ada bagian yang siap / belum selesai";
          for (const c of chapters) {
            const active = await rows<Job>(
              db,
              "SELECT * FROM jobs WHERE chapter_id=? AND state IN ('queued','running')",
              [c.id],
            );
            if (active.some((j) => ["ARTICLE", "EDITOR"].includes(j.kind)))
              continue;
            const settings = await this.bookSettings(
              c.book,
              db,
              c.content_type_id ?? 1,
            );
            const stock = await this.stock(c.id, undefined, db);
            c.stock_counts = {};
            for (const b of stock)
              c.stock_counts[b.kind] = (c.stock_counts[b.kind] ?? 0) + 1;
            const type = await new ContentTypeStore(this.db).get(
              c.content_type_id ?? 1,
            );
            if (!contentAllows(type, cron.kind)) continue;
            const kinds = cronJobs(cron.kind, c, settings).filter(
              (k) => !active.some((j) => j.kind === k),
            );
            if (!kinds.length) continue;
            for (const k of kinds) await this.enqueue(c.id, k, false, db);
            result = `Bagian ${c.part_number ?? c.id}: ${kinds.join(", ")} masuk antrean`;
            break;
          }
          await run(
            db,
            "UPDATE book_cron SET last_tick=?,last_result=?,next_run=? WHERE book_key=? AND kind=? AND content_type_id=?",
            [
              tick,
              result,
              now + Number(current.interval_hours) * 3600000,
              cron.book_key,
              cron.kind,
              cron.content_type_id ?? 1,
            ],
          );
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Cron gagal";
        await run(
          this.db,
          `UPDATE book_cron SET last_tick=?,last_result=?,next_run=?
          WHERE book_key=? AND kind=? AND content_type_id=? AND (last_tick IS NULL OR last_tick<?)`,
          [
            tick,
            `Gagal: ${message}`,
            now + Number(cron.interval_hours) * 3600000,
            cron.book_key,
            cron.kind,
            cron.content_type_id ?? 1,
            tick,
          ],
        );
      }
    }
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
        "UPDATE chapters SET article=?,article_status=?,revision=revision+1,quote=NULL,quote_image=NULL,text_image=NULL,sentence_audio=NULL,sentence_video=NULL,sentence_video_h=NULL,preview=NULL,report=NULL,visual_status='belum',panel_status='belum',panels=NULL,production_status='belum' WHERE id=?",
        [
          article,
          validateArticle(article).ok ? "menunggu editor" : "draft",
          id,
        ],
      );
      await run(db, "DELETE FROM chapter_stock WHERE chapter_id=?", [id]);
    });
  }
  async enqueue(
    id: number,
    kind: string,
    replace = false,
    connection?: mysql.PoolConnection,
  ) {
    const c = await this.chapter(id, connection);
    if (!c) throw Error("Bagian tidak ditemukan");
    const type = await new ContentTypeStore(this.db).get(
      c.content_type_id ?? 1,
    );
    if (!contentAllows(type, kind))
      throw Error("Tahap tidak digunakan oleh jenis konten ini");
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
        "POST_IMAGE",
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
      const settings = await this.bookSettings(
        c.book,
        connection,
        c.content_type_id ?? 1,
      );
      if (!panelSources(settings).length)
        throw Error("Pilih sumber gambar panel");
      for (const source of panelSources(settings))
        if ((await this.stock(id, source, connection)).length < PANEL_COUNT)
          throw Error("Render panel butuh enam stok gambar " + source);
    }
    if (
      kind === "POST_IMAGE" &&
      (c.article_status !== "siap" || !validateArticle(c.article).ok)
    )
      throw Error("Gambar per seluruh teks butuh artikel lolos editor");
    if (kind === "POST_IMAGE" && c.text_image && !replace)
      throw Error("Gambar sudah tersedia; gunakan regenerate");
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
      const settings = await this.bookSettings(
        c.book,
        connection,
        c.content_type_id ?? 1,
      );
      const source =
        kind === "VIDEO_KALIMAT"
          ? settings.sentenceVideoKind
          : settings.sentenceVideoHKind;
      if (!source)
        throw Error(
          `Pilih sumber gambar Video Kalimat${kind === "VIDEO_KALIMAT_H" ? " H" : ""} di Pengaturan Konten`,
        );
      const n = articleSentences(c.article).length;
      if ((await this.stock(id, "S_" + source, connection)).length < n)
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
      const insert = async (db: mysql.PoolConnection) => {
        const jobId = (
          await run(
            db,
            "INSERT INTO jobs(chapter_id,kind,state,revision,force_new) VALUES(?,?,'queued',?,?)",
            [id, kind, c.revision, regenerate ? 1 : 0],
          )
        ).insertId;
        if (
          regenerate &&
          panelSources(
            await this.bookSettings(c.book, db, c.content_type_id ?? 1),
          ).includes(kind)
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
      };
      return connection ? await insert(connection) : await this.tx(insert);
    } catch (e) {
      if ((e as { code?: string }).code === "ER_DUP_ENTRY")
        throw Error("Job aktif sudah ada");
      throw e;
    }
  }
  jobs() {
    return rows<Job>(
      this.db,
      `SELECT ${JOB_COLUMNS} FROM jobs ${currentContentType() ? "WHERE chapter_id IN (SELECT id FROM chapters WHERE content_type_id=?)" : ""} ORDER BY id DESC LIMIT 100`,
      currentContentType() ? [currentContentType()!.id] : [],
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
      "SELECT a.*,((SELECT COUNT(*) FROM chapter_stock s WHERE s.asset_id=a.id)+(SELECT COUNT(*) FROM news_stock ns JOIN news_articles n ON n.id=ns.news_id AND n.attempts=ns.revision WHERE ns.asset_id=a.id)) AS `usage` FROM assets a WHERE a.kind=? ORDER BY a.id",
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
  stock(chapterId: number, kind?: string, db: Db = this.db) {
    return rows<Binding>(
      db,
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
      textImage?: string;
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
          "UPDATE chapters SET article=?,revision=revision+1,quote=NULL,quote_image=NULL,text_image=NULL,sentence_audio=NULL,sentence_video=NULL,sentence_video_h=NULL,article_status='menunggu editor',report=NULL,preview=NULL,visual_status='belum',panel_status='belum',panels=NULL,production_status='belum' WHERE id=?",
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
          !panelSources(
            await this.bookSettings(c.book, db, c.content_type_id ?? 1),
          ).includes(j.kind)
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
      if (result.textImage !== undefined)
        await run(db, "UPDATE chapters SET text_image=? WHERE id=?", [
          result.textImage,
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
