import path from "node:path";
import { lstat, rename, rm } from "node:fs/promises";
import type mysql from "mysql2/promise";
import { ROOT } from "./config";
import { outputRoot } from "./output-paths";
import { safeFile } from "./templates";
import { withPresetLock } from "./media-stock";

export function referencesStock(value: unknown, file: string): boolean {
  if (typeof value === "string") return value === file;
  if (Array.isArray(value)) return value.some((v) => referencesStock(v, file));
  return (
    !!value &&
    typeof value === "object" &&
    Object.values(value).some((v) => referencesStock(v, file))
  );
}
export async function deleteImageStock(db: mysql.Pool, id: number) {
  const [initial]: any = await db.query(
    "SELECT * FROM media_stock WHERE id=? AND category='image'",
    [id],
  );
  if (!initial[0]) throw Error("Stok gambar tidak ditemukan");
  const stock = initial[0];
  return withPresetLock(
    stock.preset_id ? "preset" : "image",
    stock.preset_id ? `preset-${stock.preset_id}` : stock.identity_name,
    async () => {
      const connection = await db.getConnection();
      let moved = false,
        committed = false;
      let file = "",
        temporary = "";
      try {
        await connection.beginTransaction();
        const [rows]: any = await connection.query(
          "SELECT * FROM media_stock WHERE id=? AND category='image' FOR UPDATE",
          [id],
        );
        if (!rows[0]) throw Error("Stok gambar tidak ditemukan");
        const current = rows[0];
        const [regenerations]: any = await connection.query(
          "SELECT id FROM lab_runs WHERE reference_key='stock-regenerate' AND input=? AND state IN ('queued','running') LIMIT 1",
          [String(id)],
        );
        if (regenerations[0])
          throw Error(
            "Tunggu pembuatan ulang stok selesai sebelum menghapus gambar",
          );
        const [active]: any = await connection.query(
          "SELECT (SELECT COUNT(*) FROM jobs WHERE state='running')+(SELECT COUNT(*) FROM news_media_jobs WHERE state='running') AS total",
        );
        if (Number(active[0]?.total))
          throw Error(
            "Tunggu proses produksi selesai sebelum menghapus stok gambar",
          );
        file = safeFile(
          path.join(outputRoot(), "stock"),
          path.join(ROOT, current.file),
        );
        temporary = path.join(
          path.dirname(file),
          `.deleted-${id}-${Date.now()}`,
        );
        const stat = await lstat(file).catch((e) => {
          if (e.code === "ENOENT") return null;
          throw e;
        });
        if (stat && (!stat.isFile() || stat.isSymbolicLink()))
          throw Error("File stok tidak valid");
        if (stat) {
          await rename(file, temporary);
          moved = true;
        }
        await connection.query(
          "UPDATE chapters c JOIN chapter_stock s ON s.chapter_id=c.id JOIN assets a ON a.id=s.asset_id SET c.visual_status='belum' WHERE a.file=?",
          [current.file],
        );
        for (const table of ["chapter_stock", "news_stock"])
          await connection.query(
            `DELETE s FROM ${table} s JOIN assets a ON a.id=s.asset_id WHERE a.file=?`,
            [current.file],
          );
        const [chapters]: any = await connection.query(
          "SELECT id,panels,text_image,quote_image FROM chapters FOR UPDATE",
        );
        for (const c of chapters) {
          for (const field of ["panels", "text_image", "quote_image"]) {
            if (
              !c[field] ||
              !referencesStock(JSON.parse(c[field]), current.file)
            )
              continue;
            const status =
              field === "panels"
                ? ",panel_status='belum',production_status='belum'"
                : "";
            await connection.query(
              `UPDATE chapters SET ${field}=NULL${status} WHERE id=?`,
              [c.id],
            );
          }
        }
        const [outputs]: any = await connection.query(
          "SELECT * FROM news_media_outputs FOR UPDATE",
        );
        for (const o of outputs)
          if (referencesStock(JSON.parse(o.data), current.file))
            await connection.query(
              "DELETE FROM news_media_outputs WHERE news_id=? AND revision=? AND kind=?",
              [o.news_id, o.revision, o.kind],
            );
        await connection.query("DELETE FROM assets WHERE file=?", [
          current.file,
        ]);
        await connection.query("DELETE FROM media_stock WHERE id=?", [id]);
        await connection.commit();
        committed = true;
      } catch (e) {
        if (!committed) {
          await connection.rollback();
          if (moved) await rename(temporary, file);
        }
        throw e;
      } finally {
        connection.release();
      }
      if (moved) await rm(temporary).catch(() => {});
    },
  );
}
