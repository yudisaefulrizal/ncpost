import path from "node:path";
import { mkdir, writeFile, rename, rm } from "node:fs/promises";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { ROOT, dbConfig } from "../src/server/config";
import { MEDIA_RESET_SQL, mediaResetFolders } from "../src/server/media-reset";

dotenv.config({
  path: path.join(ROOT, ".env"),
  quiet: true,
} as dotenv.DotenvConfigOptions);
const apply = process.argv.includes("--apply");
if (!apply && !process.argv.includes("--dry-run"))
  throw Error("Gunakan --dry-run atau --apply");
const guard = path.join(ROOT, "data", "media-reset.guard");
const output = path.join(ROOT, "output");
const db = await mysql.createConnection(dbConfig());
let guardOwned = false;
const moved: { from: string; to: string }[] = [];
try {
  const [active]: any = await db.query(
    `SELECT (SELECT COUNT(*) FROM jobs WHERE state='running')+(SELECT COUNT(*) FROM news_media_jobs WHERE state='running')+(SELECT COUNT(*) FROM news_articles WHERE state='running')+(SELECT COUNT(*) FROM lab_runs WHERE state='running')+(SELECT COUNT(*) FROM chapters WHERE post_status IN ('preparing','processing','publishing') OR reels_status IN ('preparing','processing','publishing'))+(SELECT COUNT(*) FROM zernio_publications WHERE status IN ('submitting','processing','pending','publishing')) AS total`,
  );
  const folders = await mediaResetFolders(output);
  console.log(
    "Folder yang akan dicadangkan:",
    folders.map((f) => path.relative(ROOT, f)),
  );
  const [counts]: any = await db.query(
    "SELECT (SELECT COUNT(*) FROM assets) AS gambar,(SELECT COUNT(*) FROM media_stock) AS stok,(SELECT COUNT(*) FROM chapters) AS topik,(SELECT COUNT(*) FROM news_media_outputs) AS hasil_berita",
  );
  console.log("Data:", counts[0], "Proses aktif:", active[0].total);
  console.log(
    "Artikel, topik, preset, referensi/logo, akun, kredensial, jadwal dan histori posting eksternal dipertahankan.",
  );
  if (!apply) process.exitCode = 0;
  else {
    if (!process.argv.includes("--services-stopped"))
      throw Error(
        "Hentikan aplikasi web dan worker, lalu gunakan --apply --services-stopped",
      );
    await mkdir(path.dirname(guard), { recursive: true });
    await writeFile(guard, new Date().toISOString(), {
      flag: "wx",
      mode: 0o600,
    });
    guardOwned = true;
    if (Number(active[0].total))
      throw Error(
        "Masih ada job running; reset dibatalkan. Selesaikan/pulihkan job terlebih dahulu.",
      );
    const backup = path.join(
      output,
      "media-backups",
      new Date().toISOString().replace(/[:.]/g, "-"),
    );
    await mkdir(backup, { recursive: true, mode: 0o700 });
    // Store DB snapshot before mutations, allowing recovery after a process crash.
    const snapshot: Record<string, unknown> = {};
    for (const table of [
      "assets",
      "media_stock",
      "chapter_stock",
      "news_stock",
      "news_media_outputs",
      "chapters",
      "jobs",
      "news_media_jobs",
    ]) {
      const [rows] = await db.query(`SELECT * FROM ${table}`);
      snapshot[table] = rows;
    }
    await writeFile(
      path.join(backup, "database.json"),
      JSON.stringify(snapshot),
      { mode: 0o600 },
    );
    let committed = false;
    await db.beginTransaction();
    try {
      for (const from of folders) {
        const to = path.join(backup, path.relative(output, from));
        await mkdir(path.dirname(to), { recursive: true, mode: 0o700 });
        await rename(from, to);
        moved.push({ from, to });
      }
      for (const sql of MEDIA_RESET_SQL) await db.query(sql);
      await db.commit();
      committed = true;
      await writeFile(
        path.join(backup, "completed.json"),
        JSON.stringify({ completedAt: new Date().toISOString(), moved }),
        { mode: 0o600 },
      );
      console.log("Reset selesai. Cadangan:", path.relative(ROOT, backup));
    } catch (error) {
      if (!committed) {
        await db.rollback();
        for (const move of moved.reverse()) await rename(move.to, move.from);
      }
      throw error;
    }
  }
} finally {
  if (guardOwned) await rm(guard, { force: true });
  await db.end();
}
