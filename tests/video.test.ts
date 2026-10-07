import { it, expect } from "vitest";
import {
  karaokeAss,
  narrationOffset,
  visualizerFrame,
  VERTICAL_KARAOKE,
  LANDSCAPE_KARAOKE,
} from "../src/server/video";
import { canStart } from "../src/server/domain";
const layout = {
  x: 130,
  y: 700,
  size: 35,
  lineHeight: 46,
  lines: ["satu dua", "tiga"],
  ascender: 0.928,
  descender: -0.236,
};
it("karaoke: paragraf tampil sejak t=0, satu event per baris di posisi statis", () => {
  const ass = karaokeAss(layout, 3, 0, LANDSCAPE_KARAOKE);
  const events = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
  expect(events).toEqual([
    "Dialogue: 0,0:00:00.00,0:00:03.00,Karaoke,,0,0,0,,{\\an8\\pos(130,700)}{\\kf100}satu {\\kf100}dua",
    "Dialogue: 0,0:00:00.00,0:00:03.00,Karaoke,,0,0,0,,{\\an8\\pos(130,746)}{\\kf200}{\\kf100}tiga",
  ]);
  // Ukuran ASS = ukuran em × (ascender − descender).
  expect(ass).toContain(
    "Style: Karaoke,DejaVu Sans,40.74,&H00FFFFFF,&H73FFFFFF",
  );
});
it("karaoke panel 1: highlight menunggu judul selesai dibacakan", () => {
  const events = karaokeAss(layout, 4, 1, LANDSCAPE_KARAOKE)
    .split("\n")
    .filter((l) => l.startsWith("Dialogue:"));
  expect(events[0]).toContain("{\\kf100}{\\kf100}satu {\\kf100}dua");
  expect(events[1]).toContain("{\\kf300}{\\kf100}tiga");
  expect(narrationOffset("Judul", "x".repeat(95), 10)).toBeCloseTo(0.5);
  expect(narrationOffset("x".repeat(90), "y", 10)).toBe(4);
});
it("visualizer: 40 bar alpha 0.2, tinggi minimal 10px saat hening", () => {
  const frame = visualizerFrame(Buffer.alloc(40 * 90 * 3));
  const alpha = (x: number, y: number) => frame[(y * 288 + x) * 4 + 3];
  const startX = Math.floor((288 - (4 * 40 + 3 * 39)) / 2);
  expect(alpha(startX + 1, 5)).toBe(51);
  expect(alpha(startX + 1, 12)).toBe(0);
  expect(alpha(startX + 4, 5)).toBe(0);
});
it("video menunggu audio dan gambar kalimat bagian yang sama; Reels IG menunggu video", () => {
  const job = (
    id: number,
    chapter_id: number,
    kind: string,
    state: string,
  ) => ({
    id,
    chapter_id,
    kind,
    state,
  });
  const v = job(5, 1, "VIDEO_KALIMAT", "queued");
  expect(canStart(v, [job(3, 1, "TTS_KALIMAT", "queued")])).toBe(false);
  expect(canStart(v, [job(3, 1, "S_IMAGE_VERTICAL", "running")])).toBe(false);
  expect(canStart(v, [job(3, 2, "TTS_KALIMAT", "running")])).toBe(true);
  expect(
    canStart(job(6, 1, "REELS_IG", "queued"), [
      job(5, 1, "VIDEO_KALIMAT", "running"),
    ]),
  ).toBe(false);
});
it("subtitle vertikal 1080×1920: kartu 920px berakhir 380px dari bawah", async () => {
  const { subtitleLayout, openingLayout, SUBTITLE_VERTICAL } = await import(
    "../src/server/render"
  );
  const one = subtitleLayout(
    "Kritik jarang mengubah orang.",
    SUBTITLE_VERTICAL,
  );
  expect(one).toMatchObject({ x: 540, size: 52, lineHeight: 71 });
  expect(one.cardTop + one.cardHeight).toBe(1920 - 380);
  const long = subtitleLayout(
    Array(20).fill("kebiasaan").join(" "),
    SUBTITLE_VERTICAL,
  );
  expect(long.lines.length).toBeLessThanOrEqual(6);
  expect(
    // Kata panjang di 92px melebihi 920px → heading mengecil otomatis.
    openingLayout(
      "Kecemerlanganmu Bisa Terasa Seperti Ancaman",
      SUBTITLE_VERTICAL,
    ).size,
  ).toBeLessThanOrEqual(92);
});
it("subtitle horizontal: tebal rata tengah di kartu 1440px, maks 4 baris", async () => {
  const { subtitleLayout } = await import("../src/server/render");
  const { karaokeAss, LANDSCAPE_KARAOKE } = await import("../src/server/video");
  const one = subtitleLayout("Kritik jarang mengubah orang.");
  expect(one).toMatchObject({
    x: 960,
    size: 50,
    lineHeight: 68,
    lines: ["Kritik jarang mengubah orang."],
  });
  expect(one.cardTop + one.cardHeight).toBe(992);
  expect(one.y).toBe(one.cardTop + 34 + 8 + 22);
  const long = subtitleLayout(Array(22).fill("kebiasaan").join(" "));
  expect(long.lines.length).toBeLessThanOrEqual(4);
  expect(long.size).toBeLessThan(50);
  const ass = karaokeAss(one, 2, 0, LANDSCAPE_KARAOKE);
  expect(ass).toContain("PlayResX: 1920\nPlayResY: 1080");
  expect(ass).toContain("&H00FFFFFF,&H73FFFFFF");
  expect(ass).toContain(",-1,0,0,0,100,100,0,0,1,0,0,8,");
  expect(ass).toContain("{\\an8\\pos(960,");
});
it("slide pembuka E2: heading 84px mengecil sampai maks 3 baris", async () => {
  const { openingLayout } = await import("../src/server/render");
  expect(
    openingLayout("Kecemerlanganmu Bisa Terasa Seperti Ancaman"),
  ).toMatchObject({
    size: 84,
    lineHeight: 97,
  });
  const long = openingLayout(Array(7).fill("kecemerlangan").join(" "));
  expect(long.lines.length).toBeLessThanOrEqual(3);
  expect(long.size).toBeLessThan(84);
});
it("format: ukuran keluaran = ukuran upload, 24 fps, jeda kalimat 0,6 dtk", async () => {
  const { VERTICAL, LANDSCAPE, FPS, FADE_FRAMES } = await import(
    "../src/server/video"
  );
  expect(FPS).toBe(24);
  expect([VERTICAL, LANDSCAPE].map((f) => [f.width, f.height])).toEqual([
    [720, 1280],
    [1280, 720],
  ]);
  // Ruang desain tetap 1080/1920 (frame dan ASS), diskalakan 2/3.
  expect([VERTICAL, LANDSCAPE].map((f) => f.designWidth / f.width)).toEqual([
    1.5, 1.5,
  ]);
  expect(VERTICAL.gapFrames).toBe(14); // 0,6 dtk
  expect(LANDSCAPE.gapFrames).toBe(14);
  expect(FADE_FRAMES).toBe(10);
});
it("rencana timeline: badan + transisi menutup total frame tanpa celah", async () => {
  const { planTimeline, FADE_FRAMES: F } = await import("../src/server/video");
  const clips = [120, 90, 200, 241];
  const plan = planTimeline(clips);
  expect(plan.total).toBe(120 + 90 + 200 + 241 - 3 * F);
  expect(plan.starts).toEqual([0, 110, 190, 380]);
  // Potongan berurutan di timeline dan menutup seluruh frame.
  let at = 0;
  for (const piece of plan.pieces) {
    expect(piece.start).toBe(at);
    at += piece.frames;
  }
  expect(at).toBe(plan.total);
  expect(plan.pieces.map((p) => [p.kind, p.slide, p.from, p.frames])).toEqual([
    ["body", 0, 0, 110],
    ["trans", 0, 110, F],
    ["body", 1, F, 70],
    ["trans", 1, 80, F],
    ["body", 2, F, 180],
    ["trans", 2, 190, F],
    ["body", 3, F, 231],
  ]);
  expect(() => planTimeline([100, 15, 100])).toThrow(/terlalu pendek/);
  expect(() => planTimeline([100])).toThrow(/dua klip/);
});
it("karaoke: teks tetap tampil sampai akhir klip (holdUntil), bukan hilang saat narasi selesai", async () => {
  const { karaokeAss } = await import("../src/server/video");
  const layout = {
    x: 130,
    y: 700,
    size: 35,
    lineHeight: 46,
    lines: ["satu dua"],
    ascender: 0.928,
    descender: -0.236,
  };
  expect(karaokeAss(layout, 3, 0, VERTICAL_KARAOKE)).toContain(
    ",0:00:03.00,Karaoke",
  );
  expect(karaokeAss(layout, 3, 0, VERTICAL_KARAOKE, 4.5)).toContain(
    ",0:00:04.50,Karaoke",
  );
  // Tidak memendekkan event bila holdUntil lebih kecil dari narasi.
  expect(karaokeAss(layout, 3, 0, VERTICAL_KARAOKE, 1)).toContain(
    ",0:00:03.00,Karaoke",
  );
});
it("job video berjalan satu per satu di seluruh sistem, lintas bagian", () => {
  const job = (
    id: number,
    chapter_id: number,
    kind: string,
    state: string,
  ) => ({
    id,
    chapter_id,
    kind,
    state,
  });
  // Video bagian lain yang sedang berjalan menahan video berikutnya.
  expect(
    canStart(job(5, 2, "VIDEO_KALIMAT_H", "queued"), [
      job(4, 1, "VIDEO_KALIMAT", "running"),
      job(5, 2, "VIDEO_KALIMAT_H", "queued"),
    ]),
  ).toBe(false);
  // Antrean lebih awal didahulukan walau belum berjalan.
  expect(
    canStart(job(6, 2, "VIDEO_KALIMAT_H", "queued"), [
      job(5, 1, "VIDEO_KALIMAT", "queued"),
      job(6, 2, "VIDEO_KALIMAT_H", "queued"),
    ]),
  ).toBe(false);
  expect(
    canStart(job(5, 1, "VIDEO_KALIMAT", "queued"), [
      job(5, 1, "VIDEO_KALIMAT", "queued"),
      job(6, 2, "VIDEO_KALIMAT_H", "queued"),
    ]),
  ).toBe(true);
  // Job bukan-video tidak ikut dibatasi.
  expect(
    canStart(job(7, 2, "TTS", "queued"), [
      job(4, 1, "VIDEO_KALIMAT", "running"),
      job(7, 2, "TTS", "queued"),
    ]),
  ).toBe(true);
});
