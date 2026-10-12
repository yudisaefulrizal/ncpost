import { beforeEach, afterEach, expect, it, vi } from "vitest";
import path from "node:path";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { ROOT } from "../src/server/config";
import { outputRoot } from "../src/server/output-paths";
import { renamePresetStock } from "../src/server/preset-stock-rename";
beforeEach(() => vi.stubEnv("NCPOST_TEST", "true"));
afterEach(async () => {
  for (const folder of ["preset-lama", "preset-baru"])
    await rm(path.join(outputRoot(), "stock", folder), {
      recursive: true,
      force: true,
    });
  vi.unstubAllEnvs();
});
async function fixture() {
  const original = path.join(
    outputRoot(),
    "stock/preset-lama/preset-lama__vertikal__teks.png",
  );
  await mkdir(path.dirname(original), { recursive: true });
  await writeFile(original, "image fixture");
  const oldFile = path.relative(ROOT, original);
  const updates: any[] = [];
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(async () => {}),
    release: vi.fn(),
    query: vi.fn(async (sql: string, args?: unknown[]) => {
      if (sql.startsWith("SELECT * FROM media_stock"))
        return [
          [
            {
              id: 1,
              preset_id: 7,
              category: "image",
              identity_name: "preset-lama__vertikal",
              source_text: "Teks",
              file: oldFile,
            },
          ],
        ];
      if (sql.startsWith("SELECT * FROM chapters"))
        return [
          [
            {
              id: 9,
              panels: JSON.stringify({
                panels: [{ file: oldFile }],
                closing: null,
              }),
            },
          ],
        ];
      if (sql.startsWith("SELECT")) return [[]];
      updates.push({ sql, args });
      return [{ affectedRows: 1 }];
    }),
  };
  return {
    original,
    connection,
    updates,
    db: { getConnection: async () => connection } as any,
  };
}
it("renames preset files, retains extension, updates asset and carousel references in one transaction", async () => {
  const f = await fixture();
  await renamePresetStock(f.db, 7, "Preset lama", "Preset baru", async (db) =>
    db.query("UPDATE lab_prompts SET name=?", ["Preset baru"]),
  );
  const destination = path.join(
    outputRoot(),
    "stock/preset-baru/preset-baru__vertikal__teks.png",
  );
  expect(await readFile(destination, "utf8")).toBe("image fixture");
  expect(f.connection.commit).toHaveBeenCalledOnce();
  const chapterUpdate = f.updates.find((x) =>
    x.sql.startsWith("UPDATE chapters"),
  );
  expect(JSON.parse(chapterUpdate.args[0]).panels[0].file).toBe(
    path.relative(ROOT, destination),
  );
  expect(f.updates.some((x) => x.sql.startsWith("UPDATE assets"))).toBe(true);
});
it("restores previous filenames when database update fails", async () => {
  const f = await fixture();
  await expect(
    renamePresetStock(f.db, 7, "Preset lama", "Preset baru", async () => {
      throw Error("Database gagal");
    }),
  ).rejects.toThrow("Database gagal");
  expect(await readFile(f.original, "utf8")).toBe("image fixture");
  expect(f.connection.commit).not.toHaveBeenCalled();
  expect(f.connection.rollback).toHaveBeenCalled();
});
