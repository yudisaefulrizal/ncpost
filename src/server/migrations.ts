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
  for (const [table, column, definition] of [
    ["chapters", "text_image", "TEXT NULL"],
    ["chapters", "content_type_id", "INT NOT NULL DEFAULT 1"],
    ["news_articles", "content_type_id", "INT NOT NULL DEFAULT 2"],
    ["book_settings", "content_type_id", "INT NOT NULL DEFAULT 1"],
    ["book_cron", "content_type_id", "INT NOT NULL DEFAULT 1"],
    [
      "lab_prompts",
      "image_type",
      "VARCHAR(16) NOT NULL DEFAULT 'illustration'",
    ],
    ["lab_runs", "image_type", "VARCHAR(16) NOT NULL DEFAULT 'illustration'"],
    ["lab_prompts", "reference_images", "TEXT NULL"],
    ["lab_runs", "reference_images", "TEXT NULL"],
    ["lab_prompts", "logo_image", "VARCHAR(40) NULL"],
    ["lab_runs", "logo_image", "VARCHAR(40) NULL"],
    ["lab_prompts", "reference_image", "VARCHAR(40) NULL"],
    ["lab_runs", "reference_image", "VARCHAR(40) NULL"],
    ["lab_prompts", "reference_key", "VARCHAR(64) NULL"],
    ["lab_runs", "reference_key", "VARCHAR(64) NULL"],
    ["lab_runs", "resolved_prompt", "MEDIUMTEXT NULL"],
  ]) {
    const [columns]: any = await connection.query(
      `SHOW COLUMNS FROM ${table} LIKE ?`,
      [column],
    );
    if (!columns.length)
      await connection.query(
        `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`,
      );
  }
  for (const [table, keys] of [
    ["book_settings", "content_type_id,book_key"],
    ["book_cron", "content_type_id,book_key,kind"],
  ]) {
    const [indexes]: any = await connection.query(
      `SHOW INDEX FROM ${table} WHERE Key_name='PRIMARY'`,
    );
    if (!indexes.some((index: any) => index.Column_name === "content_type_id"))
      await connection.query(
        `ALTER TABLE ${table} DROP PRIMARY KEY, ADD PRIMARY KEY(${keys})`,
      );
  }
  for (const table of ["lab_prompts", "lab_runs"]) {
    await connection.query(
      `INSERT IGNORE INTO lab_images(id,name,role) SELECT DISTINCT reference_image,'Referensi tersimpan','reference' FROM ${table} WHERE reference_image IS NOT NULL`,
    );
  }
}
