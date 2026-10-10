import { afterEach, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import sharp from "sharp";
import {
  DEFAULT_BOOK_SETTINGS,
  normalizeBookSettings,
} from "../src/server/book-settings";
import {
  productionLabPrompt,
  wholeTextProductionPrompt,
  productionLabText,
  selectLabPrompt,
  validateLabSettings,
} from "../src/server/lab-production";
import { saveLabImage, labImageFile } from "../src/server/lab-images";
import { generateWholeTextImage } from "../src/worker/text-image";
import { chapterDir } from "../src/server/output-paths";
const files: string[] = [];
afterEach(async () => {
  await Promise.all(files.splice(0).map((file) => rm(file, { force: true })));
  vi.unstubAllEnvs();
});
const vars = {
  buku: '"Buku produksi"',
  bab: '"Bab sebenarnya"',
  teks: "Paragraf produksi",
  artikel: "Seluruh artikel",
  quote: "Quote produksi",
};
const rows = [
  { id: 1, kind: "article", reference_key: "book", prompt: "Aturan {{bab}}" },
  { id: 2, kind: "article", reference_key: "news", prompt: "Berita" },
  {
    id: 3,
    kind: "image",
    reference_key: "IMAGE_VERTICAL",
    prompt: "Gambar {{teks}}",
  },
  {
    id: 4,
    kind: "image",
    reference_key: "QUOTE_PAPERCUT",
    prompt: "Quote {{quote}}",
  },
  { id: 5, kind: "image", reference_key: null, prompt: "Logo dan gaya" },
];
it("persists toggle selections, including an explicit all-off state, and rejects invalid IDs", () => {
  expect(
    normalizeBookSettings({ labPromptIds: [1, 3, 3] }).labPromptIds,
  ).toEqual([1, 3]);
  expect(normalizeBookSettings({ labPromptIds: [] }).labPromptIds).toEqual([]);
  for (const value of [[0], ["1"], [-1], [1.2], "1"])
    expect(() => normalizeBookSettings({ labPromptIds: value })).toThrow(
      "Pilihan prompt Lab",
    );
});
it("uses compatible active prompts for book/news, stock images and quote images", () => {
  expect(selectLabPrompt(rows, "book", () => 0)?.id).toBe(1);
  expect(selectLabPrompt(rows, "news", () => 0)?.id).toBe(2);
  expect(selectLabPrompt(rows, "IMAGE_VERTICAL", () => 0)?.id).toBe(3);
  expect(selectLabPrompt(rows, "QUOTE_IMAGE", () => 0)?.id).toBe(4);
  expect(selectLabPrompt(rows, "POST_IMAGE", () => 0)?.id).toBe(3);
  expect(selectLabPrompt(rows, "IMAGE_HORIZONTAL", () => 0)?.id).toBe(5);
  expect(selectLabPrompt(rows, "IMAGE_VERTICAL", () => 0.99)?.id).toBe(5);
});
it("substitutes real production content instead of the lab test sample", () => {
  expect(productionLabText(rows[0], "book", vars)).toContain(
    'Input buku: "Buku produksi"; bab: "Bab sebenarnya"',
  );
  expect(productionLabText(rows[0], "book", vars)).toContain(
    'Aturan "Bab sebenarnya"',
  );
  expect(productionLabText(rows[2], "IMAGE_VERTICAL", vars)).toBe(
    "Gambar Paragraf produksi",
  );
  expect(productionLabText(rows[4], "POST_IMAGE", vars)).toBe(
    "Logo dan gaya\n\nParagraf produksi",
  );
  expect(() =>
    productionLabText(
      { ...rows[2], prompt: "{{unknown}}" },
      "IMAGE_VERTICAL",
      vars,
    ),
  ).toThrow("Placeholder");
});
it("all-off avoids the database and falls back to the original production prompt", async () => {
  const query = vi.fn();
  expect(
    await productionLabPrompt(
      { query } as any,
      DEFAULT_BOOK_SETTINGS,
      "book",
      vars,
    ),
  ).toBeNull();
  expect(
    await productionLabPrompt(
      { query } as any,
      { ...DEFAULT_BOOK_SETTINGS, labPromptIds: [] },
      "IMAGE_VERTICAL",
      vars,
    ),
  ).toBeNull();
  expect(query).not.toHaveBeenCalled();
});
it("validates missing and incompatible selections before saving settings", async () => {
  const db = { query: vi.fn().mockResolvedValue([[rows[1]]]) } as any;
  await expect(
    validateLabSettings(
      db,
      { ...DEFAULT_BOOK_SETTINGS, labPromptIds: [2] },
      "book",
    ),
  ).rejects.toThrow("tidak sesuai");
  db.query.mockResolvedValue([[]]);
  await expect(
    validateLabSettings(
      db,
      { ...DEFAULT_BOOK_SETTINGS, labPromptIds: [2] },
      "news",
    ),
  ).rejects.toThrow("tidak ditemukan");
});
it("passes the saved static attachment and tuned prompt to a real production image request adapter", async () => {
  vi.stubEnv("NCPOST_TEST", "true");
  const id = await saveLabImage(
    await sharp({
      create: { width: 10, height: 15, channels: 3, background: "white" },
    })
      .png()
      .toBuffer(),
  );
  const image = await labImageFile(id);
  files.push(image);
  const db = {
    query: vi
      .fn()
      .mockResolvedValue([
        [{ ...rows[4], reference_images: JSON.stringify([id]) }],
      ]),
  } as any;
  const lab = await productionLabPrompt(
    db,
    { ...DEFAULT_BOOK_SETTINGS, labPromptIds: [5] },
    "IMAGE_LAB_5_V",
    { ...vars, teks: vars.artikel },
  );
  expect(lab?.images).toEqual([image]);
  const generate = vi.fn().mockResolvedValue({ width: 10, height: 15 });
  const chapter = {
    id: 991282,
    book: "__test-lab-production",
    title: "Bab",
    part_number: 1,
  };
  try {
    await generateWholeTextImage(
      chapter,
      vars.artikel,
      "/tmp/test",
      1,
      8,
      generate,
      lab,
    );
    expect(generate).toHaveBeenCalledWith(
      "Logo dan gaya\n\nSeluruh artikel",
      "/tmp/test",
      expect.any(String),
      "bebas",
      [image],
    );
  } finally {
    await rm(chapterDir(chapter), { recursive: true, force: true });
  }
});

it("single-image styles include the full text even when the built-in style usually uses only a heading", async () => {
  const db = { query: vi.fn() } as any;
  const result = await wholeTextProductionPrompt(
    db,
    { ...DEFAULT_BOOK_SETTINGS, wholeTextImageKind: "IMAGE_PAPERCUT" },
    vars,
  );
  expect(result?.prompt).toContain(vars.teks);
  expect(result?.prompt).not.toContain("Orientasi:");
  expect(result?.prompt).not.toContain("Buat satu gambar yang merangkum");
  expect(result?.images).toEqual([]);
  expect(db.query).not.toHaveBeenCalled();
  expect(
    await wholeTextProductionPrompt(db, DEFAULT_BOOK_SETTINGS, vars),
  ).toBeNull();
});

it("uses the selected Lab single-image prompt without extra production instructions", async () => {
  const row = {
    id: 5,
    kind: "image",
    prompt: "Desain persegi dengan teks {{teks}}",
    reference_key: null,
  };
  const db = { query: vi.fn().mockResolvedValue([[row]]) } as any;
  const result = await wholeTextProductionPrompt(
    db,
    { ...DEFAULT_BOOK_SETTINGS, wholeTextImageKind: "IMAGE_LAB_5_V" },
    vars,
  );
  expect(result?.prompt).toBe(`Desain persegi dengan teks ${vars.teks}`);
});
