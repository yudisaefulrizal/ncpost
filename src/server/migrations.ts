import { readFileSync } from "node:fs";
import path from "node:path";
import type { Connection } from "mysql2/promise";
import { ROOT } from "./config";

// Perubahan tabel lama harus ditambahkan secara eksplisit di sini.
// CREATE TABLE IF NOT EXISTS hanya menangani tabel yang belum ada.
export async function migrateDatabase(connection: Connection) {
  await connection.query(
    readFileSync(path.join(ROOT, "src/server/schema.sql"), "utf8"),
  );
  const [newsOutputIndexes] = (await connection.query(
    "SHOW INDEX FROM news_media_outputs WHERE Key_name='PRIMARY'",
  )) as any;
  if (!newsOutputIndexes.some((index: any) => index.Column_name === "revision"))
    await connection.query(
      "ALTER TABLE news_media_outputs DROP PRIMARY KEY, ADD PRIMARY KEY(news_id,revision,kind)",
    );
  const [cronColumns] = (await connection.query(
    "SHOW COLUMNS FROM book_cron",
  )) as any;
  const hasCronColumn = (name: string) =>
    cronColumns.some((c: any) => c.Field === name);
  if (!hasCronColumn("interval_hours"))
    await connection.query(
      "ALTER TABLE book_cron ADD COLUMN interval_hours INT NOT NULL DEFAULT 24",
    );
  if (!hasCronColumn("next_run")) {
    await connection.query(
      "ALTER TABLE book_cron ADD COLUMN next_run BIGINT NULL",
    );
    await connection.query(
      "UPDATE book_cron SET next_run=? + interval_hours*3600000 WHERE enabled=1",
      [Date.now()],
    );
  }
}
