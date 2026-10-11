import { expect, it } from "vitest";
import { youtubePublishInput } from "../src/server/youtube-publish";
import { DEFAULT_BOOK_SETTINGS } from "../src/server/book-settings";
it("YouTube bawaan publik dan bukan anak-anak serta mengikuti konfigurasi eksplisit", () => {
  const settings = {
    ...DEFAULT_BOOK_SETTINGS,
    socialTargets: ["youtube" as const],
    youtubeAccountId: "yt",
  };
  expect(youtubePublishInput("book:1", "Judul", settings)).toMatchObject({
    visibility: "public",
    madeForKids: false,
    mediaKey: "book:1:v",
    consent: true,
  });
  expect(
    youtubePublishInput("news:2", "Judul", {
      ...settings,
      sentenceVideoHKind: "IMAGE_HORIZONTAL",
      youtube: { visibility: "private", madeForKids: true, synthetic: true },
    }),
  ).toMatchObject({
    visibility: "private",
    madeForKids: true,
    mediaKey: "news:2:h",
  });
});
