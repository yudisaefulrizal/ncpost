import { checkGeneration, generationSignal } from "./generation-cancel";
import { createHash } from "node:crypto";
import path from "node:path";
import { mkdir, readdir, lstat, rename, rm } from "node:fs/promises";
import sharp from "sharp";
import mysql from "mysql2/promise";
import { ROOT, dbConfig } from "./config";
import { outputRoot } from "./output-paths";

let catalog: mysql.Pool | undefined;
export function configureMediaStock(db: mysql.Pool | undefined) {
  catalog = db;
}
export function stockPart(text: string) {
  return (
    text
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "gambar"
  );
}
export function stockName(identity: string[], text: string) {
  const prefix = identity.map(stockPart).join("__");
  if (prefix.length > 190)
    throw Error("Identitas stok terlalu panjang (maksimal 190 karakter)");
  return `${prefix}__${stockPart(text)}`.slice(0, 200).replace(/-+$/, "");
}
export function resolveMedia(file: string, legacyDir: string) {
  return file.startsWith("output/")
    ? path.join(ROOT, file)
    : path.join(legacyDir, file);
}
export async function withPresetLock<T>(
  category: string,
  identity: string,
  run: () => Promise<T>,
): Promise<T> {
  if (catalog) {
    checkGeneration();
    const db = await mysql.createConnection(dbConfig());
    const signal = generationSignal();
    const stopWaiting = () => db.destroy();
    signal?.addEventListener("abort", stopWaiting, { once: true });
    const key =
      "ncpost-stock-" +
      createHash("sha256")
        .update(category + ":" + identity)
        .digest("hex")
        .slice(0, 48);
    try {
      checkGeneration();
      const [rows]: any = await db.query("SELECT GET_LOCK(?,600) AS acquired", [
        key,
      ]);
      if (Number(rows[0]?.acquired) !== 1)
        throw Error("Stok sedang digunakan proses lain; coba ulang");
      try {
        return await run();
      } finally {
        await db.query("SELECT RELEASE_LOCK(?)", [key]);
      }
    } finally {
      signal?.removeEventListener("abort", stopWaiting);
      await db.end().catch(() => {});
    }
  }
  const base = path.join(outputRoot(), "cache", "stock-locks");
  await mkdir(base, { recursive: true });
  const lock = path.join(base, `${category}-${stockPart(identity)}`);
  const deadline = Date.now() + 600000;
  for (;;) {
    checkGeneration();
    try {
      await mkdir(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() > deadline)
        throw Error("Stok sedang digunakan proses lain; coba ulang");
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  try {
    return await run();
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
export async function sharedMedia({
  category,
  identity,
  text,
  presetId,
  prompt,
  force = false,
  generate,
  details,
}: {
  category: "image" | "audio" | "video";
  identity: string[];
  text: string;
  presetId?: number;
  prompt?: string;
  force?: boolean;
  generate: (temporary: string) => Promise<unknown>;
  details?: () => unknown;
}) {
  let folder = identity.map(stockPart).join("__");
  let dir = path.join(
    outputRoot(),
    category === "image"
      ? "stock"
      : category === "audio"
        ? "stock-audio"
        : "stock-video",
    category === "image" ? stockPart(identity[0]) : folder,
  );
  if (category === "video")
    dir = path.join(outputRoot(), "stock-video", ...identity.map(stockPart));
  let name = stockName(identity, text);
  return withPresetLock(
    presetId ? "preset" : category,
    presetId ? `preset-${presetId}` : folder,
    async () => {
      checkGeneration();
      if (catalog && presetId) {
        const [presets]: any = await catalog.query(
          "SELECT name FROM lab_prompts WHERE id=? AND kind='image'",
          [presetId],
        );
        if (!presets[0]) throw Error("Preset stok tidak tersedia");
        identity = [presets[0].name, ...identity.slice(1)];
        folder = identity.map(stockPart).join("__");
        dir = path.join(
          outputRoot(),
          category === "image" ? "stock" : "stock-video",
          category === "image" ? stockPart(identity[0]) : folder,
        );
        if (category === "video")
          dir = path.join(
            outputRoot(),
            "stock-video",
            ...identity.map(stockPart),
          );
        name = stockName(identity, text);
      }
      if (catalog && category !== "image") {
        const [previous]: any = await catalog.query(
          "SELECT prompt FROM media_stock WHERE category=? AND identity_name=? AND name=?",
          [category, folder, name],
        );
        if (previous[0] && previous[0].prompt !== (prompt ?? null))
          force = true;
      }
      await mkdir(dir, { recursive: true, mode: 0o700 });
      const extensions =
        category === "image"
          ? [".jpg", ".jpeg", ".png", ".webp"]
          : category === "audio"
            ? [".mp3", ".wav", ".m4a", ".ogg"]
            : [".mp4", ".m4v", ".mov", ".webm"];
      const existing = (await readdir(dir))
        .sort()
        .find(
          (file) =>
            path.parse(file).name === name &&
            extensions.includes(path.extname(file).toLowerCase()),
        );
      let file = path.join(
        dir,
        `${name}${category === "image" ? ".jpg" : category === "audio" ? ".mp3" : ".mp4"}`,
      );
      if (existing) {
        const candidate = path.join(dir, existing);
        const stat = await lstat(candidate);
        if (stat.isSymbolicLink() || !stat.isFile())
          throw Error("File stok tidak valid");
        if (stat.size > 0) file = candidate;
        else if (!force) force = true;
      }
      if (!existing || force) {
        // Temporary file stays in the same filesystem for atomic replacement.
        const temporary = path.join(
          dir,
          `.pending-${process.pid}-${Date.now()}.${category === "image" ? "jpg" : category === "audio" ? "mp3" : "mp4"}`,
        );
        try {
          checkGeneration();
          await generate(temporary);
          checkGeneration();
          const stat = await lstat(temporary);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0)
            throw Error("Hasil stok kosong atau tidak valid");
          if (category === "image") {
            const meta = await sharp(temporary).metadata();
            if (!meta.width || !meta.height)
              throw Error("Gambar stok tidak valid");
            // Generated outputs are JPEG; an old PNG is preserved until replacement succeeds.
            file = path.join(dir, `${name}.jpg`);
          }
          checkGeneration();
          await rename(temporary, file);
          if (existing && path.join(dir, existing) !== file)
            await rm(path.join(dir, existing));
        } finally {
          await rm(temporary, { force: true });
        }
      }
      if (catalog)
        await catalog.query(
          `INSERT INTO media_stock(category,preset_id,identity_name,name,source_text,prompt,file,metadata)
       VALUES(?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE metadata=COALESCE(VALUES(metadata),metadata), preset_id=VALUES(preset_id),source_text=VALUES(source_text),prompt=VALUES(prompt),file=VALUES(file),updated_at=CURRENT_TIMESTAMP`,
          [
            category,
            presetId ?? null,
            folder,
            name,
            text,
            prompt ?? null,
            path.relative(ROOT, file),
            details && details() !== undefined
              ? JSON.stringify(details())
              : null,
          ],
        );
      return file;
    },
  );
}

export async function sharedVideo(options: {
  preset: string;
  presetId?: number;
  horizontal: boolean;
  text: string;
  recipe: unknown;
  sources: string[];
  force?: boolean;
  generate: (temporary: string) => Promise<any>;
}) {
  const versions = await Promise.all(
    options.sources.map(async (file) => {
      const stat = await lstat(file);
      return { file, size: stat.size, modified: stat.mtimeMs };
    }),
  );
  const identity = [
    options.preset,
    options.horizontal ? "horizontal" : "vertikal",
  ];
  let metadata: any;
  const file = await sharedMedia({
    category: "video",
    identity,
    presetId: options.presetId,
    text: options.text,
    force: options.force,
    prompt: JSON.stringify({ recipe: options.recipe, versions }),
    generate: async (temporary) => {
      metadata = await options.generate(temporary);
    },
    details: () => metadata,
  });
  if (!metadata && catalog) {
    const [rows]: any = await catalog.query(
      "SELECT metadata FROM media_stock WHERE category='video' AND file=?",
      [path.relative(ROOT, file)],
    );
    metadata = rows[0]?.metadata ? JSON.parse(rows[0].metadata) : {};
  }
  return { ...metadata, file: path.relative(ROOT, file) };
}
