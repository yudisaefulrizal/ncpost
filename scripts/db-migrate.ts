import path from "node:path";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { ROOT } from "../src/server/config";
import { migrateDatabase } from "../src/server/migrations";

dotenv.config({
  path: path.join(ROOT, ".env"),
  quiet: true,
} as dotenv.DotenvConfigOptions);
for (const key of ["DB_NAME", "DB_USER", "DB_PASSWORD"]) {
  if (!process.env[key]) throw Error(`${key} wajib diisi di .env`);
}
const connection = await mysql.createConnection({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: true,
});
try {
  await migrateDatabase(connection);
  console.log(`Migrasi database ${process.env.DB_NAME} selesai`);
} finally {
  await connection.end();
}
