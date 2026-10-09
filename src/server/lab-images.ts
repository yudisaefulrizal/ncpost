import { randomUUID } from "node:crypto";
import { mkdir, writeFile, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { outputRoot } from "./output-paths";

export const LAB_IMAGE_LIMIT = 10 * 1024 * 1024;
export function labImageId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^[a-f0-9-]{36}\.png$/.test(value))
    throw Error("Gambar referensi tidak valid");
  return value;
}
export async function labImageFile(value: unknown) {
  const id = labImageId(value);
  if (!id) throw Error("Gambar referensi tidak ditemukan");
  const root = path.resolve(outputRoot(), "lab-references");
  const file = path.join(root, id);
  const stat = await lstat(file).catch(() => null);
  if (
    !stat?.isFile() ||
    stat.isSymbolicLink() ||
    (await realpath(file)) !== file
  )
    throw Error("Gambar referensi tidak ditemukan");
  return file;
}
export async function saveLabImage(data: Buffer) {
  if (!Buffer.isBuffer(data) || !data.length || data.length > LAB_IMAGE_LIMIT)
    throw Error("Gambar referensi maksimal 10 MB");
  const image = sharp(data, { limitInputPixels: 40000000, animated: false });
  const meta = await image.metadata();
  if (
    !meta.format ||
    !["jpeg", "png", "webp"].includes(meta.format) ||
    (meta.pages || 1) > 1
  )
    throw Error("Gunakan gambar JPG, PNG, atau WebP statis");
  const normalized = await image.rotate().png().toBuffer();
  const root = path.join(outputRoot(), "lab-references");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const id = `${randomUUID()}.png`;
  await writeFile(path.join(root, id), normalized, { mode: 0o600, flag: "wx" });
  return id;
}

export function labImageIds(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 8)
    throw Error("Maksimal 8 gambar lampiran");
  return [
    ...new Set(
      value.map((item) => {
        const id = labImageId(item);
        if (!id) throw Error("Gambar lampiran tidak valid");
        return id;
      }),
    ),
  ];
}
export function labAttachments(value: {
  reference_images?: string | string[] | null;
  reference_image?: string | null;
  logo_image?: string | null;
}) {
  if (value.reference_images !== undefined && value.reference_images !== null) {
    return labImageIds(
      typeof value.reference_images === "string"
        ? JSON.parse(value.reference_images)
        : value.reference_images,
    );
  }
  return labImageIds([value.reference_image, value.logo_image].filter(Boolean));
}
