import { productionLabText } from "./lab-production";
import { imageVariables, mediaUnits } from "./content-contract";
import { labConfig } from "./lab-config";
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
  if (stock.preset_id && !presets[0])
    throw Error("Preset gambar tidak tersedia; pilih preset yang masih ada");
  let prompt = stock.prompt;
  if (presets[0]) {
    const preset = presets[0];
    const [chapters]: any = await db.query(
      "SELECT DISTINCT c.article,c.book AS context,c.title AS topic FROM chapters c JOIN chapter_stock s ON s.chapter_id=c.id JOIN assets a ON a.id=s.asset_id WHERE BINARY a.file=BINARY ? ORDER BY c.id LIMIT 20",
      [stock.file],
    );
    const [news]: any = await db.query(
      "SELECT DISTINCT n.article,'' AS context,n.title AS topic FROM news_articles n JOIN news_stock s ON s.news_id=n.id AND s.revision=n.attempts JOIN assets a ON a.id=s.asset_id WHERE BINARY a.file=BINARY ? ORDER BY n.id LIMIT 20",
      [stock.file],
    );
    const variables = regenerationVariables(stock.source_text, [
      ...chapters,
      ...news,
    ]);
    const orientation = stock.identity_name.split("__")[1];
    const target =
      orientation === "bebas"
        ? `QUOTE_LAB_${preset.id}`
        : `IMAGE_LAB_${preset.id}_${orientation === "horizontal" ? "H" : "V"}`;
    prompt = productionLabText(preset, target, variables);
    if (
      !labConfig(preset.config) &&
      orientation !== "bebas" &&
      preset.image_type !== "ready_video"
    )
      prompt += `\n\nOrientasi gambar: ${orientation === "horizontal" ? "horizontal 16:9" : "vertikal 9:16"}.`;
  }
  const images = presets[0]
    ? await Promise.all(labAttachments(presets[0]).map(labImageFile))
    : [];
  await sharedMedia({
    category: "image",
    identity: stock.identity_name.split("__"),
    presetId: stock.preset_id || undefined,
    text: stock.source_text,
    prompt,
    force: true,
    generate: async (temporary) => {
      const raw = path.join(work, "regenerated.jpg");
      await generate(prompt, work, raw, "bebas", images);
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
  return { image: true, stockId: id, prompt };
}

export function regenerationVariables(
  text: string,
  sources: { article: string; context: string; topic: string }[],
) {
  for (const source of sources) {
    if (!source.article) continue;
    for (const unit of ["paragraph", "sentence", "article"] as const) {
      const entries = mediaUnits(source.article, unit);
      const index = entries.findIndex((entry) => entry.text === text);
      if (index >= 0)
        return {
          ...imageVariables(
            source.article,
            unit,
            index,
            false,
            source.context,
            source.topic,
          ),
          teks: text,
          quote: text,
        };
    }
  }
  return {
    ...imageVariables(text, "article", 0, true),
    paragraf: text,
    kalimat: text,
    quote: text,
    teks: text,
  };
}
