// Target posting harian milik Manajer, per jenis konten dan sosmed. Disimpan
// terpisah dari pengaturan konten (data/manager-targets.json): Manajer hanya
// membaca Rencana konten sosmed, tidak pernah mengubah pengaturan jenis konten.
// File ini hanya ditulis server (Ruang Manajer); worker cukup membacanya.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type mysql from "mysql2/promise";
import { ROOT } from "./config";
import {
  SOCIAL_TARGETS,
  socialTargets,
  type BookSettings,
  type SocialTarget,
} from "./book-settings";

export type PostTargets = Record<SocialTarget, number>;
export type TargetMap = Record<string, PostTargets>;
export const MAX_POST_TARGET = 50;

export function normalizePostTargets(input: any): PostTargets {
  const out = { instagram: 0, youtube: 0, tiktok: 0 } as PostTargets;
  for (const platform of SOCIAL_TARGETS) {
    const value = input?.[platform] ?? 0;
    if (!Number.isInteger(value) || value < 0 || value > MAX_POST_TARGET)
      throw Error(`Target posting harus angka bulat 0–${MAX_POST_TARGET}`);
    out[platform] = value;
  }
  return out;
}

export function normalizeTargetMap(input: any): TargetMap {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("Target tidak valid");
  const out: TargetMap = {};
  for (const [id, value] of Object.entries(input)) {
    if (!/^[1-9]\d{0,9}$/.test(id)) throw Error("Jenis konten tidak valid");
    out[id] = normalizePostTargets(value);
  }
  return out;
}

/** Target yang berlaku: sosmed yang tidak aktif di jenis konten itu = 0. */
export function activeTargets(
  map: TargetMap,
  type: { id: number; settings: BookSettings | null },
): PostTargets {
  const targets = normalizePostTargets(map[String(type.id)]);
  const active = socialTargets(type.settings);
  for (const platform of SOCIAL_TARGETS)
    if (!active.includes(platform)) targets[platform] = 0;
  return targets;
}

export const targetsFile = () =>
  path.join(ROOT, "data", "manager-targets.json");

export function loadTargets(file = targetsFile()): TargetMap | null {
  try {
    if (!existsSync(file)) return null;
    return normalizeTargetMap(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return {};
  }
}

export function saveTargets(input: unknown, file = targetsFile()) {
  const map = normalizeTargetMap(input);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + ".tmp";
  writeFileSync(tmp, JSON.stringify(map, null, 2), { mode: 0o600 });
  renameSync(tmp, file);
  return map;
}

/**
 * Target Manajer. Sekali saja: target lama yang sempat tersimpan di pengaturan
 * jenis konten (postTargets) dipindahkan ke file Manajer, tanpa mengubah DB.
 */
export async function managerTargets(
  db: Pick<mysql.Pool, "query">,
  file = targetsFile(),
): Promise<TargetMap> {
  const saved = loadTargets(file);
  if (saved) return saved;
  const map: TargetMap = {};
  try {
    const [rows]: any = await db.query(
      "SELECT id,settings FROM content_types WHERE deleted_at IS NULL",
    );
    for (const row of rows) {
      try {
        const settings =
          typeof row.settings === "string"
            ? JSON.parse(row.settings)
            : row.settings;
        if (settings?.postTargets)
          map[String(row.id)] = normalizePostTargets(settings.postTargets);
      } catch {
        // Target lama yang tidak valid diabaikan.
      }
    }
  } catch {
    return map;
  }
  return saveTargets(map, file);
}
