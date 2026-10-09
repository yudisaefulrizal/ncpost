import { it, expect } from "vitest";
import { newsFixture } from "./fixtures/news";
import {
  newsContent,
  newsPostImagePrompt,
  newsCaption,
  newsKinds,
  newsStageDone,
  newsPrerequisite,
  emptyNewsProduction,
} from "../src/server/news-production-domain";
import {
  normalizeBookSettings,
  DEFAULT_BOOK_SETTINGS,
} from "../src/server/book-settings";
it("berita memakai empat paragraf dan audio hanya isi tanpa judul atau sumber", () => {
  const c = newsContent(newsFixture().article);
  expect(c.paragraphs).toHaveLength(4);
  expect(c.sentences).toHaveLength(8);
  expect(c.sentences[0].text).not.toContain("Kabar");
  expect(newsCaption(newsFixture().article)).toContain("#berita");
  expect(newsCaption(newsFixture().article)).not.toContain("#buku");
});
it("perubahan sumber memerlukan render baru sambil mempertahankan stok lajur lain", () => {
  const s = normalizeBookSettings({
      ...DEFAULT_BOOK_SETTINGS,
      sentenceKinds: [],
      sentenceVideoKind: "IMAGE_VERTICAL",
    }),
    p = emptyNewsProduction();
  p.outputs.PANEL = {
    sources: {
      panelHorizontal: s.panelHorizontal,
      panelVertical: s.panelVertical,
    },
  };
  expect(newsStageDone("PANEL", p, s, newsFixture().article)).toBe(true);
  const next = { ...s, panelVertical: "IMAGE_PAPERCUT" };
  expect(newsStageDone("PANEL", p, next, newsFixture().article)).toBe(false);
  expect(newsPrerequisite("POST_IG", p, next, newsFixture().article)).toContain(
    "Render",
  );
  expect(newsKinds("IMAGES_VIDEO", s)).toEqual(["S_IMAGE_VERTICAL"]);
});

it("artikel kosong tidak ditandai selesai pada gambar per kalimat", () => {
  const s = normalizeBookSettings({
    ...DEFAULT_BOOK_SETTINGS,
    sentenceKinds: ["IMAGE_VERTICAL"],
  });
  expect(newsStageDone("IMAGES_VIDEO", emptyNewsProduction(), s, "")).toBe(
    false,
  );
});

it("prompt gambar post hanya instruksi sederhana dan semua paragraf artikel", () => {
  const article = newsFixture().article;
  const prompt = newsPostImagePrompt(article);
  expect(prompt).toBe(
    "buat menjadi infografis\n\n" +
      newsContent(article).paragraphs.join("\n\n"),
  );
  expect(prompt).not.toContain(newsContent(article).title);
  expect(prompt).not.toContain("Sumber:");
  expect(prompt).not.toContain("Tag:");
  const p = emptyNewsProduction();
  expect(newsKinds("POST_IMAGE", DEFAULT_BOOK_SETTINGS)).toEqual([
    "POST_IMAGE",
  ]);
  expect(
    newsPrerequisite("POST_IMAGE", p, DEFAULT_BOOK_SETTINGS, article),
  ).toBeNull();
  expect(newsStageDone("POST_IMAGE", p, DEFAULT_BOOK_SETTINGS, article)).toBe(
    false,
  );
  p.outputs.POST_IMAGE = { file: "infografis.jpg" };
  expect(newsStageDone("POST_IMAGE", p, DEFAULT_BOOK_SETTINGS, article)).toBe(
    true,
  );
});
