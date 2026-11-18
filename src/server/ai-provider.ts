import type mysql from "mysql2/promise";
// Penyedia CLI untuk teks dan gambar: Codex CLI atau agy (Antigravity CLI).
// Disimpan di DB agar server web dan worker membaca pilihan yang sama.
export const AI_PROVIDERS = ["codex", "agy"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];
let database: mysql.Pool | undefined;
export function configureAiProvider(db: mysql.Pool | undefined) {
  database = db;
}
export function normalizeAiProvider(value: unknown): AiProvider {
  if (!(AI_PROVIDERS as readonly unknown[]).includes(value))
    throw Error("Penyedia AI tidak valid: pilih codex atau agy");
  return value as AiProvider;
}
const TABLE = `CREATE TABLE IF NOT EXISTS app_settings (
  name VARCHAR(64) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
let ensured = false;
async function ensure(db: mysql.Pool) {
  if (ensured) return;
  await db.query(TABLE);
  ensured = true;
}
/** Pilihan tersimpan; tanpa DB atau tanpa pilihan memakai AI_PROVIDER lalu codex. */
export async function getAiProvider(db = database): Promise<AiProvider> {
  const fallback = process.env.AI_PROVIDER === "agy" ? "agy" : "codex";
  if (!db) return fallback;
  await ensure(db);
  const [rows]: any = await db.query(
    "SELECT value FROM app_settings WHERE name='ai_provider'",
  );
  const value = rows?.[0]?.value;
  return (AI_PROVIDERS as readonly string[]).includes(value)
    ? (value as AiProvider)
    : fallback;
}
export async function setAiProvider(value: unknown, db = database) {
  const provider = normalizeAiProvider(value);
  if (!db) throw Error("Database belum siap");
  await ensure(db);
  await db.query(
    "INSERT INTO app_settings(name,value) VALUES('ai_provider',?) ON DUPLICATE KEY UPDATE value=VALUES(value)",
    [provider],
  );
  return provider;
}
