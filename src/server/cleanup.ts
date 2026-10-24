// Pembersihan penyimpanan (lihat cleanup-domain.ts): video dan gambar siap
// posting milik konten yang sudah terbit di semua sosmed yang dituju dihapus.
// Dipanggil worker tiap menit (otomatis, sesudah posting selesai) dan tombol
// Bersihkan. Yang tetap: artikel, audio, dan stok gambar ilustrasi.
import { readdir, lstat, rm } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./config";
import {
  allPublished,
  isGone,
  manifestFiles,
  markGone,
  requiredPosts,
  type CleanKind,
  type Published,
} from "./cleanup-domain";
import { ContentTypeStore } from "./content-types";
import { isFinalOutput, type ContentType } from "./content-type-domain";
import { labImageKind } from "./lab-image-types";
import { resolveMedia } from "./media-stock";
import { sentStatus, sourceRef } from "./office";
import { chapterDir, outputRoot, panelDir } from "./output-paths";
import type { Store } from "./store";

export type CleanReport = { items: number; files: number; bytes: number };
type Ctx = { store: Store; act: boolean; report: CleanReport; now: number };

// Salinan di output/public hanya dibutuhkan saat posting; dibuat ulang tiap
// publikasi, jadi yang sudah lebih tua dari ini aman dihapus.
const PUBLIC_MAX_AGE = 3600000;

// Kolom hasil akhir buku, dan hasil akhir yang dilambangkannya.
const BOOK_RESULTS: [
  string,
  "VIDEO_KALIMAT" | "VIDEO_KALIMAT_H" | "PANEL" | "POST_IMAGE",
][] = [
  ["sentence_video", "VIDEO_KALIMAT"],
  ["sentence_video_h", "VIDEO_KALIMAT_H"],
  ["panels", "PANEL"],
  ["text_image", "POST_IMAGE"],
];
const NEWS_RESULTS = BOOK_RESULTS.map(([, kind]) => kind);

/** Hapus satu berkas hasil render (hanya di dalam folder output). */
async function removeFile(ctx: Ctx, file: string) {
  const resolved = path.resolve(file);
  if (!resolved.startsWith(path.resolve(outputRoot()) + path.sep)) return;
  let size: number;
  try {
    const stat = await lstat(resolved);
    if (!stat.isFile()) return;
    size = stat.size;
  } catch {
    return;
  }
  ctx.report.files++;
  ctx.report.bytes += size;
  if (!ctx.act) return;
  await rm(resolved, { force: true });
  await ctx.store.db.query("DELETE FROM media_stock WHERE file=?", [
    path.relative(ROOT, resolved),
  ]);
}

/** Hapus berkas satu hasil akhir; true bila ada manifest yang perlu ditandai. */
async function removeResult(
  ctx: Ctx,
  raw: string | null,
  kind: CleanKind,
  locate: (file: string) => string,
) {
  if (!raw || isGone(raw)) return false;
  for (const file of manifestFiles(kind, raw))
    await removeFile(ctx, locate(file));
  return true;
}

// Gambar bertipe siap posting (berisi teks) di stok konten; dilepas dari
// konten ini, dan berkasnya dihapus bila tidak dipakai konten lain.
async function readyKinds(ctx: Ctx) {
  const [rows]: any = await ctx.store.db.query(
    "SELECT id FROM lab_prompts WHERE kind='image' AND image_type IN ('ready_post','ready_video')",
  );
  return new Set<number>(rows.map((r: any) => Number(r.id)));
}
async function removeReadyStock(
  ctx: Ctx,
  ready: Set<number>,
  table: "chapter_stock" | "news_stock",
  where: string,
  params: unknown[],
) {
  const db = ctx.store.db;
  const [bindings]: any = await db.query(
    `SELECT s.kind,s.panel,a.id AS asset_id,a.file FROM ${table} s JOIN assets a ON a.id=s.asset_id WHERE ${where}`,
    params,
  );
  for (const b of bindings) {
    const lab = labImageKind(b.kind);
    if (!lab || !ready.has(lab.id)) continue;
    const [[used]]: any = await db.query(
      `SELECT (SELECT COUNT(*) FROM chapter_stock WHERE asset_id=?)+(SELECT COUNT(*) FROM news_stock WHERE asset_id=?) AS n`,
      [b.asset_id, b.asset_id],
    );
    const alone = Number(used.n) <= 1;
    if (alone) await removeFile(ctx, path.join(ROOT, b.file));
    if (!ctx.act) continue;
    await db.query(
      `DELETE s FROM ${table} s WHERE ${where} AND s.kind=? AND s.panel=?`,
      [...params, b.kind, b.panel],
    );
    if (alone) await db.query("DELETE FROM assets WHERE id=?", [b.asset_id]);
  }
}

async function zernioSent(ctx: Ctx) {
  const [rows]: any = await ctx.store.db.query(
    "SELECT source_key,platform,status FROM zernio_publications",
  );
  const sent = new Map<string, Set<string>>();
  for (const r of rows) {
    const ref = sourceRef(r.source_key);
    if (!ref || !sentStatus(r.status)) continue;
    const key = `${ref.kind}:${ref.id}`;
    sent.set(key, (sent.get(key) ?? new Set()).add(r.platform));
  }
  return sent;
}

async function cleanBooks(
  ctx: Ctx,
  type: ContentType,
  sent: Map<string, Set<string>>,
  ready: Set<number>,
) {
  const db = ctx.store.db;
  const [chapters]: any = await db.query(
    "SELECT id,book,title,part_number,content_type_id,post_status,reels_status,sentence_video,sentence_video_h,panels,text_image FROM chapters WHERE content_type_id=?",
    [type.id],
  );
  const [active]: any = await db.query(
    "SELECT DISTINCT chapter_id FROM jobs WHERE state IN ('queued','running')",
  );
  const busy = new Set<number>(active.map((r: any) => Number(r.chapter_id)));
  const finals = type.outputs.filter(isFinalOutput);
  const columns = new Map(BOOK_RESULTS.map(([column, kind]) => [kind, column]));
  for (const c of chapters) {
    if (busy.has(c.id)) continue;
    // Hanya konten yang produksinya lengkap: bila ada hasil akhir yang belum
    // ada, membersihkan gambarnya akan membuat jadwal membuatnya lagi.
    if (!finals.every((kind) => c[columns.get(kind as any) ?? ""])) continue;
    if (!BOOK_RESULTS.some(([column]) => c[column] && !isGone(c[column])))
      continue;
    const settings = await ctx.store.bookSettings(c.book, db, type.id);
    const platforms = sent.get(`book:${c.id}`) ?? new Set<string>();
    const published: Published = {
      carousel: c.post_status === "published",
      reels: c.reels_status === "published",
      tiktok: platforms.has("tiktok"),
      youtube: platforms.has("youtube"),
    };
    if (
      !allPublished(
        requiredPosts(type.outputs, settings, type.engine),
        published,
      )
    )
      continue;
    ctx.report.items++;
    for (const [column, kind] of BOOK_RESULTS) {
      const raw: string | null = c[column];
      const dir = kind === "PANEL" ? panelDir(c) : chapterDir(c);
      const had = await removeResult(ctx, raw, kind, (f) =>
        resolveMedia(f, dir),
      );
      if (had && ctx.act)
        await db.query(
          `UPDATE chapters SET ${column}=? WHERE id=? AND ${column}=?`,
          [markGone(raw, new Date(ctx.now)), c.id, raw],
        );
    }
    if (type.settings?.managed)
      await removeReadyStock(ctx, ready, "chapter_stock", "s.chapter_id=?", [
        c.id,
      ]);
  }
}

async function cleanNews(
  ctx: Ctx,
  type: ContentType,
  sent: Map<string, Set<string>>,
  ready: Set<number>,
) {
  const db = ctx.store.db;
  const [articles]: any = await db.query(
    "SELECT id,attempts FROM news_articles WHERE content_type_id=? AND state='completed'",
    [type.id],
  );
  if (!articles.length) return;
  const [outputRows]: any = await db.query(
    "SELECT o.news_id,o.revision,o.kind,o.data FROM news_media_outputs o JOIN news_articles n ON n.id=o.news_id AND n.attempts=o.revision WHERE n.content_type_id=? AND n.state='completed'",
    [type.id],
  );
  const [active]: any = await db.query(
    "SELECT DISTINCT news_id FROM news_media_jobs WHERE state IN ('queued','running')",
  );
  const busy = new Set<number>(active.map((r: any) => Number(r.news_id)));
  const outputs = new Map<number, Map<string, string>>();
  for (const o of outputRows) {
    if (!outputs.has(o.news_id)) outputs.set(o.news_id, new Map());
    outputs.get(o.news_id)!.set(o.kind, o.data);
  }
  const finals = type.outputs.filter(isFinalOutput);
  for (const n of articles) {
    const mine = outputs.get(n.id);
    if (!mine || busy.has(n.id)) continue;
    if (!finals.every((kind) => mine.has(kind))) continue;
    if (!NEWS_RESULTS.some((kind) => mine.has(kind) && !isGone(mine.get(kind))))
      continue;
    const status = (kind: string) => {
      try {
        return JSON.parse(mine.get(kind) ?? "{}").status;
      } catch {
        return null;
      }
    };
    const platforms = sent.get(`news:${n.id}`) ?? new Set<string>();
    const published: Published = {
      carousel: status("POST_IG") === "published",
      reels: status("REELS_IG") === "published",
      tiktok: platforms.has("tiktok"),
      youtube: platforms.has("youtube"),
    };
    if (
      !allPublished(
        requiredPosts(type.outputs, type.settings, "news"),
        published,
      )
    )
      continue;
    ctx.report.items++;
    for (const kind of NEWS_RESULTS) {
      const raw = mine.get(kind) ?? null;
      const had = await removeResult(ctx, raw, kind, (f) => path.join(ROOT, f));
      if (had && ctx.act)
        await db.query(
          "UPDATE news_media_outputs SET data=? WHERE news_id=? AND revision=? AND kind=?",
          [markGone(raw, new Date(ctx.now)), n.id, n.attempts, kind],
        );
    }
    if (type.settings?.managed)
      await removeReadyStock(
        ctx,
        ready,
        "news_stock",
        "s.news_id=? AND s.revision=?",
        [n.id, n.attempts],
      );
  }
}

async function cleanPublic(ctx: Ctx) {
  const dir = path.join(outputRoot(), "public");
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  for (const name of names) {
    try {
      const stat = await lstat(path.join(dir, name));
      if (stat.isFile() && ctx.now - stat.mtimeMs > PUBLIC_MAX_AGE)
        await removeFile(ctx, path.join(dir, name));
    } catch {
      // Berkas hilang saat dipindai.
    }
  }
}

let running: Promise<CleanReport> | null = null;
/**
 * Bersihkan semua konten yang sudah terbit di semua sosmed yang dituju.
 * act=false hanya menghitung perkiraan berkas dan ukurannya.
 */
export function cleanPublished(
  store: Store,
  { act = true, now = Date.now() }: { act?: boolean; now?: number } = {},
) {
  if (act && running) return running;
  const ctx: Ctx = {
    store,
    act,
    now,
    report: { items: 0, files: 0, bytes: 0 },
  };
  const job = (async () => {
    const types = await new ContentTypeStore(store.db).list();
    const sent = await zernioSent(ctx);
    const ready = await readyKinds(ctx);
    for (const type of types) {
      if (type.engine === "news") await cleanNews(ctx, type, sent, ready);
      else await cleanBooks(ctx, type, sent, ready);
    }
    await cleanPublic(ctx);
    return ctx.report;
  })();
  if (!act) return job;
  running = job.finally(() => {
    running = null;
  });
  return running;
}
