import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import dotenv from "dotenv";
export const ROOT = process.cwd();
export function initConfig() {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file) && process.env.SESSION_SECRET === undefined) {
    writeFileSync(
      file,
      `SESSION_SECRET=${randomBytes(32).toString("base64url")}\nLIVE_TTS=false\n`,
      { mode: 0o600, flag: "wx" },
    );
  }
  if (existsSync(file)) {
    chmodSync(file, 0o600);
    dotenv.config({ path: file, quiet: true } as dotenv.DotenvConfigOptions);
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16)
    throw Error("SESSION_SECRET kosong/terlalu pendek. Akses ditutup.");
  for (const dir of ["output", "output/work"])
    mkdirSync(path.join(ROOT, dir), { recursive: true, mode: 0o700 });
  return {
    secret: process.env.SESSION_SECRET,
    liveTts: process.env.LIVE_TTS === "true",
  };
}
export function privateEnv() {
  const env: NodeJS.ProcessEnv = {};
  for (const k of [
    "PATH",
    "HOME",
    "LANG",
    "LC_ALL",
    "TMPDIR",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
  ])
    if (process.env[k]) env[k] = process.env[k];
  return env;
}
// Koneksi MySQL aplikasi (user terbatas, bukan root). NCPOST_TEST memakai
// database terpisah agar test tidak menyentuh data produksi.
export function dbConfig() {
  return {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "ncpost",
    password: process.env.DB_PASSWORD || "",
    database:
      process.env.NCPOST_TEST === "true"
        ? process.env.DB_TEST_NAME || "ncpost_test"
        : process.env.DB_NAME || "ncpost",
  };
}
