import { expect, it, vi } from "vitest";
import {
  articleData,
  configuredArticlePrompt,
  imageVariables,
  mediaUnits,
  normalizeArticleConfig,
  validateUnifiedArticle,
} from "../src/server/content-contract";
import { labConfig, labTestPrompt } from "../src/server/lab-config";
import { productionLabText } from "../src/server/lab-production";
import {
  generateConfiguredArticle,
  configuredCliArgs,
} from "../src/worker/configured-article";
import { DEFAULT_BOOK_SETTINGS } from "../src/server/book-settings";
import { validateNewsArticle } from "../src/server/news";
const article =
  "# Judul\n\n## Hook\n\nPertama. Kedua!\n\nKetiga?\n\nSumber: https://example.com/artikel\n\nTag: contoh, uji";
const config = normalizeArticleConfig({
  source: "knowledge",
  topicMode: "manual",
  context: "Konteks",
  topic: "Topik",
  paragraphCount: 2,
});
it("parses the common structure without treating metadata or the heading as body", () => {
  expect(articleData(article)).toEqual({
    title: "Judul",
    heading: "Hook",
    paragraphs: ["Pertama. Kedua!", "Ketiga?"],
    source: "https://example.com/artikel",
    tags: ["contoh", "uji"],
  });
  expect(validateUnifiedArticle(article, 2).ok).toBe(true);
  expect(validateUnifiedArticle(article, 4).ok).toBe(false);
  expect(
    validateUnifiedArticle(
      article.replace("Ketiga?", "## Heading lain\n\nKetiga?"),
    ).ok,
  ).toBe(false);
});
it("uses independent global sentence indexes and leaves paragraph input empty in sentence mode", () => {
  expect(mediaUnits(article, "sentence")).toEqual([
    { text: "Pertama.", paragraph: 1, index: 1, total: 3 },
    { text: "Kedua!", paragraph: 1, index: 2, total: 3 },
    { text: "Ketiga?", paragraph: 2, index: 3, total: 3 },
  ]);
  expect(imageVariables(article, "sentence", 1)).toMatchObject({
    kalimat: "Kedua!",
    paragraf: "",
    nomor_unit: "2",
    total_unit: "3",
    judul: "Judul",
    heading: "Hook",
    artikel: "Pertama. Kedua!\n\nKetiga?",
  });
  expect(imageVariables(article, "paragraph", 1)).toMatchObject({
    paragraf: "Ketiga?",
    kalimat: "",
    nomor_unit: "2",
    total_unit: "2",
  });
  expect(imageVariables(article, "article", 0)).toMatchObject({
    nomor_unit: "1",
    total_unit: "1",
    paragraf: "",
    kalimat: "",
  });
  expect(() => imageVariables(article, "sentence", 3)).toThrow("Unit gambar");
});
it("Lab and production compose exactly the same article prompt and source instructions", async () => {
  const template =
    "Tulis {{topik}} dalam {{konteks}}, {{jumlah_paragraf}} paragraf.";
  const db = {
    query: vi
      .fn()
      .mockResolvedValue([
        [{ id: 1, kind: "article", reference_key: null, prompt: template }],
      ]),
  };
  const generate = vi.fn().mockResolvedValue(article);
  const result = await generateConfiguredArticle(
    db as any,
    { ...DEFAULT_BOOK_SETTINGS, labPromptIds: [1], articleConfig: config },
    "news",
    "/tmp",
    "",
    "",
    generate,
  );
  expect(result.prompt).toBe(
    labTestPrompt("article", template, { article: config }),
  );
  expect(generate).toHaveBeenCalledWith(result.prompt, "knowledge", "/tmp");
  expect(validateNewsArticle(result.article, config).ok).toBe(true);
});
it("supports manual materials independently of AI topic selection and web tooling", () => {
  const manual = {
    ...config,
    source: "manual" as const,
    topicMode: "ai" as const,
    material: "Bahan faktual.",
  };
  const prompt = configuredArticlePrompt("{{bahan}} {{topik}}", manual);
  expect(prompt).toContain("Bahan faktual.");
  expect(prompt).toContain("Tentukan sendiri sesuai prompt");
  expect(configuredCliArgs("web")).toContain("--search");
  expect(configuredCliArgs("knowledge")).not.toContain("--search");
  expect(configuredCliArgs("manual")).not.toContain("--search");
  expect(() =>
    configuredArticlePrompt("Tulis", { ...manual, material: "" }),
  ).toThrow("Bahan manual");
});
it("resolves first and next page prompts identically in Lab and production without extra design rules", () => {
  const imageConfig = {
    usage: "carousel" as const,
    unit: "sentence" as const,
    promptNext: "Lanjut {{nomor_unit}}/{{total_unit}}: {{kalimat}}",
    sampleArticle: article,
    testIndex: 2,
  };
  const row = {
    id: 1,
    kind: "image",
    prompt: "Sampul {{judul}}: {{kalimat}}",
    reference_key: null,
    config: JSON.stringify(imageConfig),
  };
  expect(labTestPrompt("image", row.prompt, imageConfig)).toBe(
    "Lanjut 2/3: Kedua!",
  );
  expect(
    productionLabText(
      row,
      "IMAGE_LAB_1_V",
      imageVariables(article, "sentence", 1),
    ),
  ).toBe(labTestPrompt("image", row.prompt, imageConfig));
  expect(
    productionLabText(
      row,
      "IMAGE_LAB_1_V",
      imageVariables(article, "sentence", 0),
    ),
  ).toBe("Sampul Judul: Pertama.");
  expect(labConfig("null")).toBeNull();
  expect(() =>
    labTestPrompt("image", "{{tidak_ada}}", {
      usage: "single",
      sampleArticle: article,
    }),
  ).toThrow("tidak dikenal");
});
