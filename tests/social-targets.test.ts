import { expect, it } from "vitest";
import {
  DEFAULT_BOOK_SETTINGS,
  normalizeBookSettings,
  socialTargets,
  socialColumns,
} from "../src/server/book-settings";
import {
  contentAllows,
  type ContentType,
} from "../src/server/content-type-domain";

it("infers previous targets from saved accounts and honors explicit disabled targets", () => {
  const previous = {
    ...DEFAULT_BOOK_SETTINGS,
    instagramAccountId: "12",
    youtubeAccountId: "a".repeat(24),
  };
  expect(socialTargets(previous)).toEqual(["instagram", "youtube"]);
  const disabled = normalizeBookSettings({ ...previous, socialTargets: [] });
  expect(socialTargets(disabled)).toEqual([]);
  expect(disabled.instagramAccountId).toBe("12");
  expect(disabled.youtubeAccountId).toBe("a".repeat(24));
});
it("shows all selected social targets regardless of media output", () => {
  expect(socialColumns(["instagram", "youtube", "tiktok"])).toEqual({
    instagram: true,
    youtube: true,
    tiktok: true,
  });
  expect(socialColumns([])).toEqual({
    instagram: false,
    youtube: false,
    tiktok: false,
  });
  expect(socialColumns(["tiktok"])).toEqual({
    instagram: false,
    youtube: false,
    tiktok: true,
  });
});
it("rejects invalid targets, removes duplicates and preserves targets on normalization", () => {
  expect(
    normalizeBookSettings({ socialTargets: ["tiktok", "tiktok"] })
      .socialTargets,
  ).toEqual(["tiktok"]);
  for (const socialTargets of [null, "youtube", ["facebook"], [1]])
    expect(() => normalizeBookSettings({ socialTargets })).toThrow(
      "Target sosmed tidak valid",
    );
});
it("disabling Instagram blocks publication and cron while allowing production", () => {
  const type: ContentType = {
    id: 1,
    name: "Buku",
    engine: "book",
    outputs: ["PANEL", "VIDEO_KALIMAT"],
    settings: { ...DEFAULT_BOOK_SETTINGS, socialTargets: [] },
  };
  expect(contentAllows(type, "POST_IG")).toBe(false);
  expect(contentAllows(type, "REELS_IG")).toBe(false);
  expect(contentAllows(type, "PANEL")).toBe(true);
  type.settings!.socialTargets = ["instagram"];
  expect(contentAllows(type, "POST_IG")).toBe(true);
  expect(contentAllows(type, "REELS_IG")).toBe(true);
});
