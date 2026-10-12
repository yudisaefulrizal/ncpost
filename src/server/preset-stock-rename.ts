import path from "node:path";
import { mkdir, lstat, rename, rmdir } from "node:fs/promises";
import type mysql from "mysql2/promise";
import { ROOT } from "./config";
import { stockName, stockPart, withPresetLock } from "./media-stock";
import { outputRoot } from "./output-paths";

export function replaceMediaReferences(
  value: any,
  replacements: Map<string, string>,
): any {
  if (typeof value === "string") return replacements.get(value) ?? value;
  if (Array.isArray(value))
    return value.map((x) => replaceMediaReferences(x, replacements));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        replaceMediaReferences(v, replacements),
      ]),
    );
  return value;
}
export async function renamePresetStock(
  db: mysql.Pool,
  presetId: number,
  oldName: string,
  newName: string,
  save: (connection: Pick<mysql.Pool, "query">) => Promise<any>,
) {
  const oldFolder = stockPart(oldName),
    newFolder = stockPart(newName);
  if (oldFolder === newFolder) return save(db);
  return withPresetLock("preset", `preset-${presetId}`, () =>
    withPresetLock("image", newFolder, async () => {
      const connection = await db.getConnection();
      const moves: {
        from: string;
        to: string;
        id: number;
        name: string;
        oldFile: string;
        newFile: string;
        identity: string;
      }[] = [];
      try {
        await connection.beginTransaction();
        const [rows]: any = await connection.query(
          "SELECT * FROM media_stock WHERE preset_id=? FOR UPDATE",
          [presetId],
        );
        const [owners]: any = await connection.query(
          "SELECT id FROM media_stock WHERE SUBSTRING_INDEX(identity_name,'__',1)=? AND category='image' AND (preset_id IS NULL OR preset_id<>?) LIMIT 1",
          [newFolder, presetId],
        );
        if (owners.length)
          throw Error("Nama folder preset sudah digunakan stok preset lain");
        const targets = new Set<string>();
        for (const row of rows) {
          const suffix = row.identity_name.split("__").slice(1);
          const identity = [newName, ...suffix];
          const folder = identity.map(stockPart).join("__");
          const name = stockName(identity, row.source_text);
          const from = path.join(ROOT, row.file);
          const to = path.join(
            outputRoot(),
            row.category === "video" ? "stock-video" : "stock",
            ...(row.category === "video"
              ? identity.map(stockPart)
              : [newFolder]),
            name + path.extname(from),
          );
          if (targets.has(to))
            throw Error(
              "Perubahan nama preset membuat dua stok memiliki nama sama",
            );
          targets.add(to);
          const stat = await lstat(from);
          if (!stat.isFile() || stat.isSymbolicLink())
            throw Error("Stok preset tidak valid");
          if (
            await lstat(to).then(
              () => true,
              (e) => {
                if (e.code === "ENOENT") return false;
                throw e;
              },
            )
          )
            throw Error("File tujuan preset sudah tersedia");
          moves.push({
            from,
            to,
            id: row.id,
            identity: folder,
            name,
            oldFile: row.file,
            newFile: path.relative(ROOT, to),
          });
        }
        const replacements = new Map(moves.map((m) => [m.oldFile, m.newFile]));
        const completed: typeof moves = [];
        try {
          for (const m of moves) {
            await mkdir(path.dirname(m.to), { recursive: true });
            await rename(m.from, m.to);
            completed.push(m);
            await connection.query(
              "UPDATE media_stock SET identity_name=?,name=?,file=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
              [m.identity, m.name, m.newFile, m.id],
            );
            await connection.query("UPDATE assets SET file=? WHERE file=?", [
              m.newFile,
              m.oldFile,
            ]);
          }
          for (const [table, fields] of [
            [
              "chapters",
              [
                "panels",
                "quote_image",
                "text_image",
                "sentence_audio",
                "sentence_video",
                "sentence_video_h",
              ],
            ],
            ["news_media_outputs", ["data"]],
          ] as const) {
            const [records]: any = await connection.query(
              `SELECT * FROM ${table} FOR UPDATE`,
            );
            for (const record of records)
              for (const field of fields) {
                if (!record[field]) continue;
                const before = JSON.parse(record[field]);
                const after = replaceMediaReferences(before, replacements);
                if (JSON.stringify(before) === JSON.stringify(after)) continue;
                after.renderedAt = new Date().toISOString();
                const where =
                  table === "chapters"
                    ? "id=?"
                    : "news_id=? AND revision=? AND kind=?";
                const ids =
                  table === "chapters"
                    ? [record.id]
                    : [record.news_id, record.revision, record.kind];
                await connection.query(
                  `UPDATE ${table} SET ${field}=? WHERE ${where}`,
                  [JSON.stringify(after), ...ids],
                );
              }
          }
          const result = await save(connection as any);
          await connection.commit();
          for (const dir of new Set(moves.map((m) => path.dirname(m.from))))
            await rmdir(dir).catch(() => {});
          return result;
        } catch (error) {
          await connection.rollback();
          for (const m of completed.reverse()) await rename(m.to, m.from);
          throw error;
        }
      } finally {
        await connection.rollback().catch(() => {});
        connection.release();
      }
    }),
  );
}
