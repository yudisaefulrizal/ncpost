import { expect, it } from "vitest";
import { intervalDue, cronJobs, normalizeCron } from "../src/server/cron";
import { DEFAULT_BOOK_SETTINGS } from "../src/server/book-settings";
import type { Chapter } from "../src/server/store";

it("interval mendukung jumlah jam di luar pembagian hari tanpa reset tengah malam", () => {
  const start = Date.parse("2026-10-07T16:45:00Z");
  const nextRun = start + 25 * 3600000;
  expect(intervalDue(nextRun, start + 24 * 3600000)).toBe(false);
  expect(intervalDue(nextRun, nextRun - 1)).toBe(false);
  expect(intervalDue(nextRun, nextRun)).toBe(true);
  expect(intervalDue(nextRun, nextRun + 5 * 86400000)).toBe(true);
  expect(intervalDue(null, nextRun)).toBe(false);
});
it("validasi interval jam menolak kosong, pecahan, teks dan nilai di luar batas", () => {
  for (const intervalHours of [
    undefined,
    null,
    "2",
    "",
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    8761,
  ])
    expect(() =>
      normalizeCron({ kind: "ARTICLE", enabled: true, intervalHours }),
    ).toThrow("Interval");
  expect(() =>
    normalizeCron({ kind: "BAD", enabled: true, intervalHours: 2 }),
  ).toThrow();
  expect(() =>
    normalizeCron({ kind: "ARTICLE", enabled: "false", intervalHours: 2 }),
  ).toThrow();
  expect(
    normalizeCron({ kind: "ARTICLE", enabled: false, intervalHours: 2 }),
  ).toEqual({ kind: "ARTICLE", enabled: false, intervalHours: 2 });
});
const article =
  "# Judul\n\n## Hook\n\nHook.\n\nSatu.\n\nDua.\n\nTiga.\n\nEmpat.\n\nLima.\n\nBerdasarkan buku Buku, Penulis.\n\nTag: buku";
const chapter = (patch: Partial<Chapter> = {}) =>
  ({
    article,
    article_status: "siap",
    post_status: "belum",
    reels_status: "belum",
    stock_counts: {},
    ...patch,
  }) as Chapter;
const s = {
  ...DEFAULT_BOOK_SETTINGS,
  sentenceKinds: ["IMAGE_VERTICAL"],
  sentenceVideoKind: "IMAGE_VERTICAL",
};
it("memilih hasil yang belum ada, menunggu prasyarat dan tidak menimpa draf", () => {
  expect(cronJobs("ARTICLE", chapter({ article: "" }), s)).toEqual(["ARTICLE"]);
  expect(cronJobs("ARTICLE", chapter({ article: "draft" }), s)).toEqual([]);
  expect(cronJobs("QUOTE", chapter({ article_status: "revisi" }), s)).toEqual(
    [],
  );
  expect(cronJobs("QUOTE_IMAGE", chapter(), s)).toEqual([]);
  expect(cronJobs("QUOTE_IMAGE", chapter({ quote: "quote" }), s)).toEqual([
    "QUOTE_IMAGE",
  ]);
  expect(
    cronJobs("QUOTE_IMAGE", chapter({ quote: "quote", quote_image: "{}" }), s),
  ).toEqual([]);
  expect(
    cronJobs(
      "IMAGES_PANEL",
      chapter({ stock_counts: { IMAGE_VERTICAL: 6 } }),
      s,
    ),
  ).not.toContain("IMAGE_VERTICAL");
  expect(cronJobs("IMAGES_VIDEO", chapter(), s)).toEqual(["S_IMAGE_VERTICAL"]);
  expect(cronJobs("PANEL", chapter(), s)).toEqual([]);
  expect(
    cronJobs(
      "VIDEO_KALIMAT",
      chapter({ stock_counts: { S_IMAGE_VERTICAL: 6 } }),
      s,
    ),
  ).toEqual([]);
  expect(
    cronJobs(
      "VIDEO_KALIMAT",
      chapter({ sentence_audio: "{}", stock_counts: { S_IMAGE_VERTICAL: 6 } }),
      s,
    ),
  ).toEqual(["VIDEO_KALIMAT"]);
  expect(
    cronJobs(
      "VIDEO_KALIMAT_H",
      chapter({ sentence_audio: "{}", stock_counts: { S_IMAGE_VERTICAL: 6 } }),
      s,
    ),
  ).toEqual([]);
});
it("publikasi otomatis hanya untuk hasil siap dengan status awal", () => {
  for (const status of [
    "published",
    "unknown",
    "processing",
    "failed",
    "preparing",
    "publishing",
  ]) {
    expect(
      cronJobs(
        "POST_IG",
        chapter({
          panels: "{}",
          panel_status: "tersedia",
          post_status: status,
        }),
        s,
      ),
    ).toEqual([]);
    expect(
      cronJobs(
        "REELS_IG",
        chapter({ sentence_video: "{}", reels_status: status }),
        s,
      ),
    ).toEqual([]);
  }
  expect(
    cronJobs("POST_IG", chapter({ panels: "{}", panel_status: "tersedia" }), s),
  ).toEqual(["POST_IG"]);
  expect(cronJobs("REELS_IG", chapter({ sentence_video: "{}" }), s)).toEqual([
    "REELS_IG",
  ]);
});
