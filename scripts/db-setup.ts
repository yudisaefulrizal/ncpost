// Membuat database, user aplikasi terbatas, tabel dan akun admin default.
// Password root hanya dibaca dari env saat dijalankan, tidak disimpan:
//   MYSQL_ROOT_PASSWORD=... npm run db:setup
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { ROOT } from "../src/server/config";
import { writeEnvValue } from "../src/server/credentials";
import { hashPassword } from "../src/server/auth";
dotenv.config({
  path: path.join(ROOT, ".env"),
  quiet: true,
} as dotenv.DotenvConfigOptions);
const rootPassword = process.env.MYSQL_ROOT_PASSWORD;
if (!rootPassword) throw Error("MYSQL_ROOT_PASSWORD wajib diisi");
const host = process.env.DB_HOST || "127.0.0.1";
const user = process.env.DB_USER || "ncpost";
const databases = [
  process.env.DB_NAME || "ncpost",
  process.env.DB_TEST_NAME || "ncpost_test",
];
let password = process.env.DB_PASSWORD;
if (!password) {
  password = randomBytes(24).toString("base64url");
  writeEnvValue(path.join(ROOT, ".env"), "DB_PASSWORD", password);
}
const root = await mysql.createConnection({
  host,
  port: Number(process.env.DB_PORT || 3306),
  user: "root",
  password: rootPassword,
  multipleStatements: true,
});
const schema = readFileSync(path.join(ROOT, "src/server/schema.sql"), "utf8");
try {
  for (const h of ["localhost", "127.0.0.1"]) {
    await root.query("CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?", [
      user,
      h,
      password,
    ]);
    await root.query("ALTER USER ?@? IDENTIFIED BY ?", [user, h, password]);
  }
  for (const db of databases) {
    await root.query(
      `CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await root.query(`USE \`${db}\``);
    await root.query(schema);
    const [cronColumns] = (await root.query(
      "SHOW COLUMNS FROM book_cron",
    )) as any;
    const hasCronColumn = (name: string) =>
      cronColumns.some((c: any) => c.Field === name);
    if (!hasCronColumn("interval_hours"))
      await root.query(
        "ALTER TABLE book_cron ADD COLUMN interval_hours INT NOT NULL DEFAULT 24",
      );
    if (!hasCronColumn("next_run")) {
      await root.query("ALTER TABLE book_cron ADD COLUMN next_run BIGINT NULL");
      await root.query(
        "UPDATE book_cron SET next_run=? + interval_hours*3600000 WHERE enabled=1",
        [Date.now()],
      );
    }
    for (const h of ["localhost", "127.0.0.1"])
      await root.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON \`${db}\`.* TO ?@?`,
        [user, h],
      );
    const [users] = (await root.query(
      "SELECT COUNT(*) AS n FROM users",
    )) as any;
    if (!users[0].n)
      await root.query("INSERT INTO users(email,password_hash) VALUES(?,?)", [
        "admin@gmail.com",
        hashPassword("admin123"),
      ]);
    console.log(`Database ${db} siap`);
  }
} finally {
  await root.end();
}
