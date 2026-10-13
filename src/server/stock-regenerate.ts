import path from "node:path";
import sharp from "sharp";
import { ROOT } from "./config";
import { STOCK_JPEG } from "./codex-image";
import type mysql from "mysql2/promise";
import { sharedMedia } from "./media-stock";
import { labAttachments, labImageFile } from "./lab-images";
import { generateCodexImage } from "./codex-image";

export async function enqueueStockRegeneration(db: mysql.Pool, id: number) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows]: any = await connection.query(
      "SELECT * FROM media_stock WHERE id=? AND category='image' FOR UPDATE",
      [id],
    );
    const stock = rows[0];
    if (stock?.prompt?.includes("teks ditambahkan melalui template"))
      throw Error("Stok template perlu dibuat ulang dari halaman Produksi");
    if (!stock?.prompt)
      throw Error("Stok tidak memiliki prompt untuk dibuat ulang");
    const [active]: any = await connection.query(
      "SELECT id FROM lab_runs WHERE reference_key='stock-regenerate' AND input=? AND state IN ('queued','running') LIMIT 1",
      [String(id)],
    );
    if (active[0]) {
      await connection.commit();
      return active[0].id as number;
    }
    const [result]: any = await connection.query(
      "INSERT INTO lab_runs(kind,name,prompt,input,orientation,reference_key,resolved_prompt) VALUES('image',?,?,?,?, 'stock-regenerate',?)",
      ["Buat ulang stok", stock.prompt, String(id), "bebas", stock.prompt],
    );
    await connection.commit();
    return result.insertId as number;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function regenerateStock(
  db: mysql.Pool,
  id: number,
  work: string,
  generate: typeof generateCodexImage = generateCodexImage,
) {
  const [rows]: any = await db.query(
    "SELECT * FROM media_stock WHERE id=? AND category='image'",
    [id],
  );
  const stock = rows[0];
  if (!stock?.prompt)
    throw Error("Stok tidak tersedia atau prompt tidak ditemukan");
  if (stock.prompt.includes("teks ditambahkan melalui template"))
    throw Error("Stok template perlu dibuat ulang dari halaman Produksi");
  const dimensions = await sharp(path.join(ROOT, stock.file)).metadata();
  const [presets]: any = stock.preset_id
    ? await db.query("SELECT * FROM lab_prompts WHERE id=? AND kind='image'", [
        stock.preset_id,
      ])
    : [[]];
  const images = presets[0]
    ? await Promise.all(labAttachments(presets[0]).map(labImageFile))
    : [];
  await sharedMedia({
    category: "image",
    identity: stock.identity_name.split("__"),
    presetId: stock.preset_id || undefined,
    text: stock.source_text,
    prompt: stock.prompt,
    force: true,
    generate: async (temporary) => {
      const raw = path.join(work, "regenerated.jpg");
      await generate(stock.prompt, work, raw, "bebas", images);
      await sharp(raw)
        .rotate()
        .resize(dimensions.width, dimensions.height, {
          fit: "contain",
          background: "#ffffff",
        })
        .jpeg(STOCK_JPEG)
        .toFile(temporary);
    },
  });
  return { image: true, stockId: id };
}
