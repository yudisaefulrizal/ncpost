import { afterEach, beforeEach, expect, it, vi } from "vitest";
import path from "node:path";
import { mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { deleteImageStock } from "../src/server/stock-delete";
import { ROOT } from "../src/server/config";
import { outputRoot } from "../src/server/output-paths";
beforeEach(() => vi.stubEnv("NCPOST_TEST", "true"));
afterEach(async () => {
  await rm(path.join(outputRoot(), "stock/delete-fixture"), {
    recursive: true,
    force: true,
  });
  vi.unstubAllEnvs();
});
async function fixture(active = 0) {
  const file = path.join(
    outputRoot(),
    "stock/delete-fixture/preset__vertikal__kalimat.jpg",
  );
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, "image");
  const row = {
    id: 13,
    category: "image",
    preset_id: null,
    identity_name: "delete-fixture__vertikal",
    file: path.relative(ROOT, file),
  };
  const query = vi.fn(async (sql: string, _args?: any[]) => {
    if (sql.includes("SELECT * FROM media_stock")) return [[row]];
    if (sql.includes("AS total")) return [[{ total: active }]];
    if (sql.startsWith("SELECT id,panels"))
      return [
        [{ id: 42, panels: JSON.stringify({ panels: [{ file: row.file }] }) }],
      ];
    if (sql.startsWith("SELECT * FROM news_media_outputs"))
      return [
        [
          {
            news_id: 8,
            revision: 1,
            kind: "POST_IMAGE",
            data: JSON.stringify({ file: row.file }),
          },
        ],
      ];
    return [{ affectedRows: 1 }];
  });
  const connection = {
    query,
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    release: vi.fn(),
  };
  return {
    file,
    connection,
    db: { query, getConnection: async () => connection } as any,
  };
}
it("deletes stock file and clears direct output references and asset bindings", async () => {
  const f = await fixture();
  await deleteImageStock(f.db, 13);
  expect(await readdir(path.dirname(f.file))).toEqual([]);
  const sql = f.connection.query.mock.calls.map((c) => c[0]);
  expect(sql).toContain(
    "UPDATE chapters SET panels=NULL,panel_status='belum',production_status='belum' WHERE id=?",
  );
  expect(sql).toContain("DELETE FROM media_stock WHERE id=?");
  expect(sql).toContain(
    "DELETE FROM news_media_outputs WHERE news_id=? AND revision=? AND kind=?",
  );
  expect(f.connection.commit).toHaveBeenCalledOnce();
});
it("restores the original stock file if committing the deletion fails", async () => {
  const f = await fixture();
  f.connection.commit.mockRejectedValueOnce(Error("DB failed"));
  await expect(deleteImageStock(f.db, 13)).rejects.toThrow("DB failed");
  expect(await readFile(f.file, "utf8")).toBe("image");
  expect(f.connection.rollback).toHaveBeenCalledOnce();
});
it("does not remove images while production is running", async () => {
  const f = await fixture(1);
  await expect(deleteImageStock(f.db, 13)).rejects.toThrow(
    "Tunggu proses produksi",
  );
  expect(await readFile(f.file, "utf8")).toBe("image");
  expect(f.connection.commit).not.toHaveBeenCalled();
});
