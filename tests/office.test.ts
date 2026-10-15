import { describe, expect, it } from "vitest";
import {
  sentStatus,
  sourceRef,
  wibDate,
  wibDayStart,
} from "../src/server/office";
import {
  contentAllows,
  normalizeContentType,
  type ContentType,
} from "../src/server/content-type-domain";
import { youtubePublishInput } from "../src/server/youtube-publish";
import {
  DEFAULT_BOOK_SETTINGS,
  normalizeBookSettings,
} from "../src/server/book-settings";

describe("hari WIB", () => {
  it("awal hari mengikuti UTC+7", () => {
    // 2026-10-15 17:30 UTC = 2026-10-16 00:30 WIB
    const t = Date.UTC(2026, 9, 15, 17, 30);
    expect(wibDate(t)).toBe("2026-10-16");
    expect(wibDayStart(t)).toBe(Date.UTC(2026, 9, 15, 17, 0));
  });
});

describe("sumber publikasi", () => {
  it("sumber publikasi dipetakan ke bagian/artikel", () => {
    expect(sourceRef("book:12:v")).toEqual({ kind: "book", id: 12 });
    expect(sourceRef("news:7:h")).toEqual({ kind: "news", id: 7 });
    expect(sourceRef("lain")).toBeNull();
  });
});

describe("status publikasi", () => {
  it("status Zernio gagal/tidak pasti tidak dihitung terkirim", () => {
    expect(sentStatus("published")).toBe(true);
    expect(sentStatus("scheduled")).toBe(true);
    expect(sentStatus("failed")).toBe(false);
    expect(sentStatus("unknown")).toBe(false);
  });
});

describe("rencana konten sosmed", () => {
  const type = (settings: any): ContentType =>
    normalizeContentType({
      name: "Uji",
      engine: "book",
      outputs: ["PANEL", "VIDEO_KALIMAT", "VIDEO_KALIMAT_H"],
      settings: {
        ...DEFAULT_BOOK_SETTINGS,
        sentenceVideoKind: "IMAGE_VERTICAL",
        sentenceVideoHKind: "IMAGE_HORIZONTAL",
        ...settings,
      },
    }) as ContentType;

  it("format Instagram membatasi Carousel dan Reels", () => {
    const both = type({ socialTargets: ["instagram"] });
    expect(contentAllows(both, "POST_IG")).toBe(true);
    expect(contentAllows(both, "REELS_IG")).toBe(true);
    const reelsOnly = type({
      socialTargets: ["instagram"],
      instagramFormats: ["reels"],
    });
    expect(contentAllows(reelsOnly, "POST_IG")).toBe(false);
    expect(contentAllows(reelsOnly, "REELS_IG")).toBe(true);
  });

  it("format Instagram tidak dikenal ditolak", () => {
    expect(() =>
      normalizeBookSettings({
        ...DEFAULT_BOOK_SETTINGS,
        instagramFormats: ["story"],
      }),
    ).toThrow();
    expect(() =>
      normalizeBookSettings({ ...DEFAULT_BOOK_SETTINGS, youtubeMedia: "x" }),
    ).toThrow();
  });

  it("media YouTube mengikuti pilihan bila videonya dibuat", () => {
    const base = {
      ...DEFAULT_BOOK_SETTINGS,
      socialTargets: ["youtube"],
      youtubeAccountId: "a".repeat(24),
      sentenceVideoKind: "IMAGE_VERTICAL",
      sentenceVideoHKind: "IMAGE_HORIZONTAL",
    } as any;
    expect(youtubePublishInput("book:1", "T", base).mediaKey).toBe("book:1:v");
    expect(
      youtubePublishInput("book:1", "T", { ...base, youtubeMedia: "h" })
        .mediaKey,
    ).toBe("book:1:h");
    expect(
      youtubePublishInput("book:1", "T", {
        ...base,
        youtubeMedia: "h",
        sentenceVideoHKind: null,
      }).mediaKey,
    ).toBe("book:1:v");
  });
});
