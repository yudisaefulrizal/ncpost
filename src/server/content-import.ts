// Public names are universal; book/title remain the storage fields for existing data.
export function contentImportItems(items: unknown) {
  if (!Array.isArray(items)) throw Error("File harus berisi array JSON");
  if (!items.length) throw Error("File tidak berisi entri");
  if (items.length > 600) throw Error("Maksimal 600 topik per impor");
  return items.map((item: any, index) => {
    const context = item?.konteks !== undefined ? item.konteks : item?.buku;
    const topic = item?.topik !== undefined ? item.topik : item?.tema;
    const clean = (value: unknown) =>
      typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
    const book = clean(context),
      title = clean(topic);
    if (!book || !title)
      throw Error(
        `Entri ${index + 1}: "konteks" dan "topik" wajib berupa teks`,
      );
    if (book.length > 255 || title.length > 500)
      throw Error(`Entri ${index + 1}: konteks atau topik terlalu panjang`);
    return { book, title };
  });
}
