import path from "node:path";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { ROOT, dbConfig } from "../src/server/config";
import { migrateDatabase } from "../src/server/migrations";
import { Store } from "../src/server/store";
import { verifyVideoVektorQueue } from "../src/server/video-vektor-queue-check";

dotenv.config({
  path: path.join(ROOT, ".env"),
  quiet: true,
} as dotenv.DotenvConfigOptions);
for (const key of ["DB_NAME", "DB_USER", "DB_PASSWORD"]) {
  if (!process.env[key]) throw Error(`${key} wajib diisi di .env`);
}
const connection = await mysql.createConnection({
  ...dbConfig(),
  multipleStatements: true,
});
try {
  await migrateDatabase(connection);
  console.log(`Migrasi database ${dbConfig().database} selesai`);
  const store = new Store();
  try {
    if (await verifyVideoVektorQueue(store))
      console.log(
        "Verifikasi antrean Video Vektor berhasil (transaksi dibatalkan).",
      );
  } finally {
    await store.close();
  }
} finally {
  await connection.end();
}
