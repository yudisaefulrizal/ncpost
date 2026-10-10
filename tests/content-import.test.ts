import { expect, it, vi } from "vitest";
import { contentImportItems } from "../src/server/content-import";
import { Store } from "../src/server/store";
function fixture() {
  const query = vi.fn(async (sql: string) =>
    sql.startsWith("SELECT")
      ? [[{ book: "Literasi keuangan", title: "Topik lama", part_number: 4 }]]
      : [{ affectedRows: 1 }],
  );
  const store = Object.create(Store.prototype) as Store;
  const tx = vi.fn(async (fn: any) => fn({ query }));
  (store as any).tx = tx;
  return { store, query, tx };
}
it("accepts universal context/topic and normalizes whitespace, while keeping old files compatible", () => {
  expect(
    contentImportItems([
      { konteks: "  Literasi   keuangan ", topik: " Dana darurat " },
    ]),
  ).toEqual([{ book: "Literasi keuangan", title: "Dana darurat" }]);
  expect(contentImportItems([{ buku: "Buku", tema: "Bab" }])).toEqual([
    { book: "Buku", title: "Bab" },
  ]);
  expect(() =>
    contentImportItems([{ konteks: 42, buku: "Buku", topik: "Topik" }]),
  ).toThrow('"konteks" dan "topik"');
});
it("validates every entry before opening the import transaction", async () => {
  const { store, tx } = fixture();
  await expect(
    store.importChapters([
      { konteks: "Konteks", topik: "Valid" },
      { konteks: "Konteks", topik: "" },
    ]),
  ).rejects.toThrow("Entri 2");
  expect(tx).not.toHaveBeenCalled();
  for (const items of [
    null,
    [],
    Array.from({ length: 601 }, () => ({ konteks: "K", topik: "T" })),
    [{ konteks: "K".repeat(256), topik: "T" }],
    [{ konteks: "K", topik: "T".repeat(501) }],
  ])
    expect(() => contentImportItems(items)).toThrow();
});
it("previews without writing, skips duplicates across both formats, and continues topic numbering", async () => {
  const { store, query } = fixture();
  const items = [
    { konteks: "literasi keuangan", topik: " TOPIK lama " },
    { konteks: "Literasi keuangan", topik: "Dana darurat" },
    { buku: "literasi KEUANGAN", tema: "dana darurat" },
    { konteks: "Kesehatan", topik: "Tidur" },
  ];
  expect(await store.importChapters(items, true)).toEqual({
    created: 2,
    skipped: 2,
    books: 2,
    dryRun: true,
  });
  expect(query).toHaveBeenCalledTimes(1);
  await store.importChapters(items);
  expect(query).toHaveBeenLastCalledWith(
    expect.stringContaining("INSERT INTO chapters"),
    [
      [
        ["Literasi keuangan", "Dana darurat", 5, "", 1],
        ["Kesehatan", "Tidur", 1, "", 1],
      ],
    ],
  );
});
