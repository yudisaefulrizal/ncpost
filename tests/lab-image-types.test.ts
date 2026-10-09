import { expect, it, vi } from "vitest";
import { labImageCatalog, labImageKind } from "../src/server/lab-image-types";
import {
  normalizeBookSettings,
  isStockKind,
  isHorizontalKind,
  isSentenceKind,
} from "../src/server/book-settings";
import {
  productionLabPrompt,
  validateLabSettings,
} from "../src/server/lab-production";
import { cronJobs } from "../src/server/cron";
import { canStart } from "../src/server/domain";
import { newsFixture } from "./fixtures/news";
import {
  newsPrerequisite,
  newsStageDone,
  emptyNewsProduction,
} from "../src/server/news-production-domain";
const row = {
  id: 73,
  name: "Gaya merek",
  kind: "image",
  prompt: "Gaya merek: {{teks}}",
  reference_key: null,
  reference_images: "[]",
};
it("lists a saved image type alongside paragraph/sentence lanes, quote styles, and horizontal/vertical sources", () => {
  const catalog = labImageCatalog([row]);
  expect(catalog.stock.map((type) => type.kind)).toEqual([
    "IMAGE_LAB_73_H",
    "IMAGE_LAB_73_V",
  ]);
  expect(catalog.quote[0]).toMatchObject({
    kind: "QUOTE_LAB_73",
    name: "Gaya merek",
  });
  expect(labImageKind("S_IMAGE_LAB_73_V")).toMatchObject({
    id: 73,
    orientation: "vertikal",
  });
  for (const kind of [
    "IMAGE_LAB_0_V",
    "IMAGE_LAB_1_X",
    "../../.env",
    "IMAGE_LAB_9999999999_V",
  ])
    expect(labImageKind(kind)).toBeNull();
  expect(isStockKind("IMAGE_LAB_73_H")).toBe(true);
  expect(isStockKind("S_IMAGE_LAB_73_H")).toBe(false);
  expect(isHorizontalKind("IMAGE_LAB_73_H")).toBe(true);
  expect(isSentenceKind("S_IMAGE_LAB_73_V")).toBe(true);
});
it("preserves custom lanes in settings and automatically enables chosen panel/video sources", () => {
  const settings = normalizeBookSettings({
    stockKinds: [],
    sentenceKinds: [],
    panelHorizontal: "IMAGE_LAB_73_H",
    sentenceVideoKind: "IMAGE_LAB_73_V",
    quoteImageStyle: "QUOTE_LAB_73",
  });
  expect(settings.stockKinds).toEqual(["IMAGE_LAB_73_H"]);
  expect(settings.sentenceKinds).toEqual(["IMAGE_LAB_73_V"]);
  expect(settings.quoteImageStyle).toBe("QUOTE_LAB_73");
  expect(() =>
    normalizeBookSettings({ sentenceVideoKind: "IMAGE_LAB_73_H" }),
  ).toThrow("vertikal");
  expect(() => normalizeBookSettings({ stockKinds: ["QUOTE_LAB_73"] })).toThrow(
    "Jenis stok",
  );
});
it("uses the exact selected Lab image kind independently of article prompt toggles", async () => {
  const query = vi.fn().mockResolvedValue([[row]]);
  const settings = normalizeBookSettings({
    sentenceVideoKind: "IMAGE_LAB_73_V",
    quoteImageStyle: "QUOTE_LAB_73",
  });
  await validateLabSettings({ query } as any, settings, "book");
  const image = await productionLabPrompt(
    { query } as any,
    settings,
    "IMAGE_LAB_73_V",
    { teks: "Kalimat sebenarnya", quote: "", artikel: "", buku: "", bab: "" },
  );
  expect(image?.id).toBe(73);
  expect(image?.prompt).toBe("Gaya merek: Kalimat sebenarnya");
  const quote = await productionLabPrompt(
    { query } as any,
    settings,
    "QUOTE_LAB_73",
    {
      teks: "Quote sebenarnya",
      quote: "Quote sebenarnya",
      artikel: "",
      buku: "",
      bab: "",
    },
  );
  expect(quote?.prompt).toContain("Quote sebenarnya");
  query.mockResolvedValue([[]]);
  await expect(
    productionLabPrompt({ query } as any, settings, "IMAGE_LAB_73_V", {
      teks: "x",
    }),
  ).rejects.toThrow("tidak ditemukan");
});
it("rejects missing image types and wrong orientation variants when saving", async () => {
  const query = vi
    .fn()
    .mockResolvedValue([[{ ...row, reference_key: "IMAGE_VERTICAL" }]]);
  await expect(
    validateLabSettings(
      { query } as any,
      normalizeBookSettings({ panelHorizontal: "IMAGE_LAB_73_H" }),
    ),
  ).rejects.toThrow("tidak sesuai");
  query.mockResolvedValue([[{ ...row, kind: "article" }]]);
  await expect(
    validateLabSettings(
      { query } as any,
      normalizeBookSettings({ sentenceKinds: ["IMAGE_LAB_73_V"] }),
    ),
  ).rejects.toThrow("tidak sesuai");
});
it("waits for dynamic image lanes before starting their panel or video render", () => {
  const job = { id: 2, chapter_id: 1, kind: "VIDEO_KALIMAT", state: "queued" };
  const source = {
    id: 1,
    chapter_id: 1,
    kind: "S_IMAGE_LAB_73_V",
    state: "running",
  };
  expect(canStart(job, [source])).toBe(false);
  expect(
    canStart({ ...job, kind: "PANEL" }, [
      { ...source, kind: "IMAGE_LAB_73_H" },
    ]),
  ).toBe(false);
  expect(canStart(job, [{ ...source, chapter_id: 2 }])).toBe(true);
});
it("news production recognizes dynamic paragraph/sentence jobs and uses a custom lane as video source", () => {
  const article = newsFixture().article;
  const settings = normalizeBookSettings({
    stockKinds: ["IMAGE_LAB_73_H"],
    sentenceVideoKind: "IMAGE_LAB_73_V",
  });
  const p = emptyNewsProduction();
  expect(newsPrerequisite("IMAGE_LAB_73_H", p, settings, article)).toBeNull();
  expect(newsPrerequisite("S_IMAGE_LAB_73_V", p, settings, article)).toBeNull();
  expect(newsPrerequisite("VIDEO_KALIMAT", p, settings, article)).toContain(
    "audio",
  );
  p.outputs.VIDEO_KALIMAT = { source: "IMAGE_LAB_73_V" };
  expect(newsStageDone("VIDEO_KALIMAT", p, settings, article)).toBe(true);
});

it("cron requests custom paragraph/sentence lanes and accepts them as a ready video source", () => {
  const article =
    "# Judul\n\n## Hook\n\nHook.\n\nSatu.\n\nDua.\n\nTiga.\n\nEmpat.\n\nLima.\n\nBerdasarkan buku Buku, Penulis.\n\nTag: buku";
  const settings = normalizeBookSettings({
    stockKinds: ["IMAGE_LAB_73_H"],
    sentenceVideoKind: "IMAGE_LAB_73_V",
  });
  const chapter = {
    article,
    article_status: "siap",
    stock_counts: {},
    sentence_audio: "{}",
    sentence_video: null,
  } as any;
  expect(cronJobs("IMAGES_PANEL", chapter, settings)).toEqual([
    "IMAGE_LAB_73_H",
  ]);
  expect(cronJobs("IMAGES_VIDEO", chapter, settings)).toEqual([
    "S_IMAGE_LAB_73_V",
  ]);
  chapter.stock_counts["S_IMAGE_LAB_73_V"] = 6;
  expect(cronJobs("VIDEO_KALIMAT", chapter, settings)).toEqual([
    "VIDEO_KALIMAT",
  ]);
});
