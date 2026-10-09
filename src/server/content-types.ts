import { validateLabSettings } from "./lab-production";
import { AsyncLocalStorage } from "node:async_hooks";
import type mysql from "mysql2/promise";
import { normalizeBookSettings } from "./book-settings";
import { contentTypeUpdate, type ContentType } from "./content-type-domain";
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
      "SELECT * FROM content_types ORDER BY id",
    );
    return rows.map(decode) as ContentType[];
  }
  async get(id: number) {
    const [rows]: any = await this.db.query(
      "SELECT * FROM content_types WHERE id=?",
      [id],
    );
    if (!rows[0]) throw Error("Jenis konten tidak ditemukan");
    return decode(rows[0]);
  }
  async save(input: unknown, id?: number) {
    const existing = id ? await this.get(id) : undefined;
    const value = contentTypeUpdate(input, existing);
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
