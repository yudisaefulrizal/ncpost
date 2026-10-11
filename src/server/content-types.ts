import { resolveImageSettings } from "./lab-image-settings";
import { validateLabSettings } from "./lab-production";
import { AsyncLocalStorage } from "node:async_hooks";
import type mysql from "mysql2/promise";
import { normalizeBookSettings } from "./book-settings";
import {
  contentTypeUpdate,
  normalizeContentType,
  type ContentType,
} from "./content-type-domain";
export * from "./content-type-domain";
const context = new AsyncLocalStorage<ContentType>();
export const currentContentType = () => context.getStore();
export const withContentType = <T>(type: ContentType, run: () => T): T =>
  context.run(type, run);
function decode(row: any): ContentType {
  return {
    ...row,
    outputs:
      typeof row.outputs === "string" ? JSON.parse(row.outputs) : row.outputs,
    settings: row.settings
      ? normalizeBookSettings(
          typeof row.settings === "string"
            ? JSON.parse(row.settings)
            : row.settings,
        )
      : null,
  };
}
export class ContentTypeStore {
  constructor(readonly db: mysql.Pool) {}
  async list() {
    const [rows]: any = await this.db.query(
      "SELECT * FROM content_types WHERE deleted_at IS NULL ORDER BY id",
    );
    return Promise.all(rows.map((row: any) => this.resolve(decode(row))));
  }
  async get(id: number) {
    const [rows]: any = await this.db.query(
      "SELECT * FROM content_types WHERE id=? AND deleted_at IS NULL",
      [id],
    );
    if (!rows[0]) throw Error("Jenis konten tidak ditemukan");
    return this.resolve(decode(rows[0]));
  }
  private async resolve(type: ContentType): Promise<ContentType> {
    if (!type.settings?.managed) return type;
    const settings = await resolveImageSettings(this.db, type.settings);
    return { ...type, ...normalizeContentType({ ...type, settings }) };
  }
  async remove(id: number) {
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();
      const [types]: any = await connection.query(
        "SELECT id FROM content_types WHERE id=? AND deleted_at IS NULL FOR UPDATE",
        [id],
      );
      if (!types.length) throw Error("Jenis konten tidak ditemukan");
      const [contents]: any = await connection.query(
        "SELECT id FROM chapters WHERE content_type_id=? UNION ALL SELECT id FROM news_articles WHERE content_type_id=? LIMIT 1",
        [id, id],
      );
      if (contents.length)
        throw Error(
          "Jenis konten masih memiliki topik atau artikel. Hapus kontennya terlebih dahulu melalui Produksi.",
        );
      await connection.query("DELETE FROM book_cron WHERE content_type_id=?", [
        id,
      ]);
      await connection.query(
        "DELETE FROM book_settings WHERE content_type_id=?",
        [id],
      );
      await connection.query("DELETE FROM news_cron WHERE category=?", [
        id === 2 ? "teknologi" : `type-${id}`,
      ]);
      await connection.query(
        "UPDATE content_types SET deleted_at=CURRENT_TIMESTAMP WHERE id=?",
        [id],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  async save(input: unknown, id?: number) {
    const existing = id ? await this.get(id) : undefined;
    const submitted: any = input;
    const configured = submitted?.settings?.managed
      ? {
          ...submitted,
          settings: await resolveImageSettings(this.db, submitted.settings),
        }
      : input;
    const value = contentTypeUpdate(configured, existing);
    await validateLabSettings(this.db, value.settings, value.engine);
    if (id && existing) {
      if (existing.engine !== value.engine)
        throw Error(
          "Sumber artikel jenis yang sudah dibuat tidak dapat diubah",
        );
      await this.db.query(
        "UPDATE content_types SET name=?,outputs=?,settings=? WHERE id=?",
        [
          value.name,
          JSON.stringify(value.outputs),
          existing.settings === null &&
          (input as any)?.settings === undefined &&
          existing.outputs.length === value.outputs.length &&
          existing.outputs.every((output) => value.outputs.includes(output))
            ? null
            : JSON.stringify(value.settings),
          id,
        ],
      );
      return this.get(id);
    }
    const [r]: any = await this.db.query(
      "INSERT INTO content_types(name,engine,outputs,settings) VALUES(?,?,?,?)",
      [
        value.name,
        value.engine,
        JSON.stringify(value.outputs),
        JSON.stringify(value.settings),
      ],
    );
    return this.get(r.insertId);
  }
}
