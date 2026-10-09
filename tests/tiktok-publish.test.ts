import { expect, it } from "vitest";
import { tiktokPublishInput } from "../src/server/tiktok-publish";
import { normalizeTikTokSettings } from "../src/server/tiktok-settings";
import {
  DEFAULT_BOOK_SETTINGS,
  normalizeBookSettings,
} from "../src/server/book-settings";
import { newsFixture } from "./fixtures/news";
const settings = {
  ...DEFAULT_BOOK_SETTINGS,
  socialTargets: ["tiktok"] as const,
  tiktokAccountId: "a".repeat(24),
  tiktok: normalizeTikTokSettings({
    privacy: "SELF_ONLY",
    media: "photo",
    allowComment: true,
    autoMusic: true,
  }),
};
it("quick publication uses first paragraph, saved account, media and options", () => {
  const input = tiktokPublishInput("news:7", newsFixture().article, "Judul", {
    ...settings,
    socialTargets: [...settings.socialTargets],
  });
  expect(input.content).toBe(newsFixture().article.split("\n\n")[1]);
  expect(input.content).not.toContain("Sumber:");
  expect(input).toMatchObject({
    mediaKey: "news:7:photo",
    accountId: settings.tiktokAccountId,
    privacy: "SELF_ONLY",
    autoMusic: true,
    allow_comment: true,
    synthetic: true,
    consent: true,
  });
});
it("book caption skips title and hook heading", () => {
  const article =
    "# Judul buku\n\n## Pembuka\n\n**Paragraf pertama.** Kalimat selanjutnya.\n\nParagraf kedua.";
  expect(
    tiktokPublishInput("book:3", article, "Bab", {
      ...settings,
      socialTargets: [...settings.socialTargets],
    }).content,
  ).toBe("Paragraf pertama. Kalimat selanjutnya.");
});
it("missing privacy, disabled targets, missing account and invalid source never publish", () => {
  const saved = { ...settings, socialTargets: [...settings.socialTargets] };
  for (const value of [
    { ...saved, tiktok: normalizeTikTokSettings(null) },
    { ...saved, socialTargets: [] },
    { ...saved, tiktokAccountId: null },
  ])
    expect(() =>
      tiktokPublishInput("news:1", newsFixture().article, "Judul", value),
    ).toThrow();
  expect(() =>
    tiktokPublishInput("news:../1", newsFixture().article, "Judul", saved),
  ).toThrow();
});
it("validates and persists saved TikTok publication settings", () => {
  expect(
    normalizeBookSettings({ ...DEFAULT_BOOK_SETTINGS, tiktok: settings.tiktok })
      .tiktok,
  ).toEqual(settings.tiktok);
  expect(() => normalizeTikTokSettings({ media: "invalid" })).toThrow();
  expect(() => normalizeTikTokSettings({ allowComment: "true" })).toThrow();
});
