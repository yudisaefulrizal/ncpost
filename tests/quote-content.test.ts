import { expect, it, vi } from "vitest";
import {
  contentAllows,
  normalizeContentType,
} from "../src/server/content-type-domain";
import {
  validateArticle,
  validateContentText,
  articleSentences,
} from "../src/server/domain";
import { cronJobs } from "../src/server/cron";
import { generateStandaloneQuote } from "../src/worker/quote";
import { DEFAULT_BOOK_SETTINGS } from "../src/server/book-settings";
import type { Chapter } from "../src/server/store";
it("restricts independent quote types to a single image without audio, video or book editorial stages", () => {
  const type = {
    id: 7,
    ...normalizeContentType({
      name: "Renungan",
      engine: "quote",
      outputs: ["POST_IMAGE"],
    }),
  };
  expect(type.engine).toBe("quote");
  expect(contentAllows(type, "ARTICLE")).toBe(true);
  expect(contentAllows(type, "POST_IMAGE")).toBe(true);
  expect(contentAllows(type, "TTS_KALIMAT")).toBe(false);
  expect(contentAllows(type, "VIDEO_KALIMAT")).toBe(false);
  expect(contentAllows(type, "EDITOR")).toBe(false);
  expect(contentAllows(type, "QUOTE")).toBe(false);
  for (const output of ["VIDEO_KALIMAT", "VIDEO_KALIMAT_H", "TTS_KALIMAT"]) {
    expect(() =>
      normalizeContentType({
        name: "Quote",
        engine: "quote",
        outputs: [output],
      }),
    ).toThrow("hanya 1 gambar");
  }
  expect(() =>
    normalizeContentType({
      name: "Quote",
      engine: "quote",
      outputs: ["PANEL"],
    }),
  ).toThrow("hanya 1 gambar");
});
it("adapts quote text for media without relaxing the book article contract", () => {
  const raw = "Belajar mendengar. Memahami sebelum menjawab.";
  expect(validateContentText(raw, "quote")).toMatchObject({
    ok: true,
    paragraphs: [raw],
    tags: [],
    attribution: "",
  });
  expect(validateArticle(raw).ok).toBe(false);
  expect(validateContentText("Satu.\n\nDua.", "quote").ok).toBe(false);
  expect(articleSentences(raw, "quote")).toEqual([
    { paragraph: 1, text: "Belajar mendengar." },
    { paragraph: 1, text: "Memahami sebelum menjawab." },
  ]);
  const row = {
    article: raw,
    content_engine: "quote",
    article_status: "siap",
    stock_counts: {},
  } as Chapter;
  expect(cronJobs("POST_IMAGE", row, DEFAULT_BOOK_SETTINGS)).toEqual([
    "POST_IMAGE",
  ]);
  expect(cronJobs("TTS_KALIMAT", row, DEFAULT_BOOK_SETTINGS)).toEqual([
    "TTS_KALIMAT",
  ]);
  expect(cronJobs("VIDEO_KALIMAT", row, DEFAULT_BOOK_SETTINGS)).toEqual([]);
});
it("generates an independent quote exclusively from its active Lab prompt", async () => {
  const query = vi.fn().mockResolvedValue([
    [
      {
        id: 3,
        kind: "quote",
        prompt: "Buat renungan tentang mendengarkan.",
        reference_key: "quote",
      },
    ],
  ]);
  const generate = vi.fn().mockResolvedValue("Dengarkan untuk memahami.");
  const result = await generateStandaloneQuote(
    { query } as any,
    { ...DEFAULT_BOOK_SETTINGS, labPromptIds: [3] },
    "/tmp/quote",
    generate,
  );
  expect(result).toBe("Dengarkan untuk memahami.");
  expect(generate).toHaveBeenCalledWith(
    expect.stringContaining("Buat renungan tentang mendengarkan."),
    "/tmp/quote",
  );
  generate.mockResolvedValue("# Judul\nQuote.");
  await expect(
    generateStandaloneQuote(
      { query } as any,
      { ...DEFAULT_BOOK_SETTINGS, labPromptIds: [3] },
      "/tmp/quote",
      generate,
    ),
  ).rejects.toThrow("satu paragraf");
});

it("requires an active self-contained Lab Quote prompt instead of falling back to a theme", async () => {
  const generate = vi.fn();
  const query = vi
    .fn()
    .mockResolvedValue([
      [
        {
          id: 3,
          kind: "quote",
          prompt: "Ringkas {{artikel}}",
          reference_key: "quote",
        },
      ],
    ]);
  await expect(
    generateStandaloneQuote(
      { query } as any,
      DEFAULT_BOOK_SETTINGS,
      "/tmp/quote",
      generate,
    ),
  ).rejects.toThrow("Aktifkan prompt Lab Quote");
  await expect(
    generateStandaloneQuote(
      { query } as any,
      { ...DEFAULT_BOOK_SETTINGS, labPromptIds: [3] },
      "/tmp/quote",
      generate,
    ),
  ).rejects.toThrow("tanpa placeholder");
  expect(generate).not.toHaveBeenCalled();
});
