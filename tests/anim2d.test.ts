import { it, expect } from "vitest";
import { Resvg } from "@resvg/resvg-js";
import { sanitizeScript } from "../src/server/anim2d/script";
import { renderFrame, setVideo } from "../src/server/anim2d/frame";
import {
  charsToWords,
  chunkWords,
  evenTimeline,
} from "../src/server/anim2d/timeline";
import {
  DEFAULT_BOOK_SETTINGS,
  isAnimation,
  normalizeBookSettings,
} from "../src/server/book-settings";
import {
  contentStages,
  normalizeContentType,
} from "../src/server/content-type-domain";
import { cronJobs } from "../src/server/cron";
import {
  emptyNewsProduction,
  newsPrerequisite,
  newsStageDone,
} from "../src/server/news-production-domain";
import { newsFixture } from "./fixtures/news";
import type { Chapter } from "../src/server/store";

const raw = {
  title: "Uji",
  world: "nature",
  scenes: [
    {
      comp: "headline",
      mood: "surprised",
      narration:
        "Coba deh kita mikir bentar. Program makan gratis libur dua hari, tapi dapurnya tetap jalan.",
      hl: ["dua hari", "tidak ada"],
      items: [
        { slot: "note", t: "note", v: "Makan gratis libur 2 hari" },
        { slot: "hero", t: "prop", n: "lunchbox", id: "box", cue: "makan" },
        { slot: "left", t: "prop", n: "fire", cue: "dapurnya" },
        { slot: "right", t: "prop", n: "naga", cue: "program" },
        { slot: "label", t: "icon", n: "zzz-tidak-ada-qqq" },
        { slot: "hero", t: "text", v: "Label yang terlalu panjang sekali" },
      ],
    },
    {
      comp: "versus",
      mood: "thinking",
      narration:
        "Di satu sisi anak sekolah libur. Di sisi lain dapur tetap masak.",
      items: [
        { slot: "left", t: "prop", n: "people", cue: "anak" },
        { slot: "right", t: "prop", n: "house", id: "box", cue: "pesawat" },
      ],
      links: [{ from: "left", to: "kosong" }],
    },
    {
      layout: "stage",
      mood: "happy",
      narration: "Menurutmu gimana? Tulis di kolom komentar ya.",
      title: "Menurutmu *gimana*?",
      icon: "message-circle",
      cta: "Komen di bawah!",
    },
  ],
};

it("naskah dari model dirapikan agar aman digambar", () => {
  const script = sanitizeScript(raw, "cadangan");
  const [a, b, c] = script.scenes;
  expect(script.world).toBe("nature");
  expect(c.layout).toBe("outro");
  expect(c.cta).toBe("Komen di bawah!");
  // Prop dan ikon tidak dikenal dibuang; benda tanah ke slot tanah;
  // item tanpa slot cocok pindah ke slot kosong yang menerima jenisnya.
  expect(a.items!.map((it) => [it.t, it.n ?? it.v, it.slot])).toEqual([
    ["note", "Makan gratis libur 2 hari", "note"],
    ["prop", "lunchbox", "hero"],
    ["prop", "fire", "ground"],
  ]);
  expect(a.hl).toEqual(["dua hari"]);
  // id sama untuk benda berbeda diganti; cue yang tidak diucapkan dikosongkan;
  // panah ke slot kosong dibuang.
  expect(b.items![1].id).toBe("box_1");
  expect(b.items![1].cue).toBe("");
  expect(b.links).toEqual([]);
  expect(() => sanitizeScript({ scenes: [] }, "x")).toThrow();
});

it("label dipotong di batas kata agar muat", () => {
  const script = sanitizeScript(
    {
      scenes: [
        {
          comp: "hero",
          narration: "Satu dua tiga.",
          items: [
            { slot: "hero", t: "prop", n: "bulb" },
            {
              slot: "label",
              t: "text",
              v: "Label yang terlalu panjang sekali",
            },
          ],
        },
        { narration: "Penutup." },
      ],
    },
    "x",
  );
  expect(script.scenes[0].items![1].v).toBe("Label yang terlalu");
});

it("Animasi 2D tidak membutuhkan gambar dan audio per kalimat", () => {
  const both = normalizeContentType({
    name: "Animasi",
    engine: "book",
    outputs: ["VIDEO_KALIMAT", "VIDEO_KALIMAT_H"],
    settings: {
      ...DEFAULT_BOOK_SETTINGS,
      sentenceVideoKind: "IMAGE_VERTICAL",
      sentenceVideoHKind: "IMAGE_HORIZONTAL",
      sentenceVideoMode: "anim2d",
      sentenceVideoHMode: "anim2d",
    },
  });
  expect(both.settings.sentenceKinds).toEqual([]);
  const stages = contentStages(both);
  expect(stages.has("IMAGES_VIDEO")).toBe(false);
  expect(stages.has("TTS_KALIMAT")).toBe(false);
  expect(isAnimation(both.settings, true)).toBe(true);
  const mixed = normalizeContentType({
    ...both,
    settings: { ...both.settings, sentenceVideoHMode: "template" },
  });
  expect(mixed.settings.sentenceKinds).toEqual(["IMAGE_HORIZONTAL"]);
  expect(contentStages(mixed).has("TTS_KALIMAT")).toBe(true);
  expect(() =>
    normalizeBookSettings({ ...DEFAULT_BOOK_SETTINGS, carouselMode: "anim2d" }),
  ).toThrow("Cara pembuatan gambar tidak dikenal");
});

it("jadwal dan berita: video animasi cukup menunggu artikel siap", () => {
  const s = normalizeBookSettings({
    ...DEFAULT_BOOK_SETTINGS,
    sentenceVideoKind: "IMAGE_VERTICAL",
    sentenceVideoMode: "anim2d",
  });
  const article =
    "# Judul\n\n## Hook\n\nHook.\n\nSatu.\n\nDua.\n\nTiga.\n\nEmpat.\n\nLima.\n\nBerdasarkan buku Buku, Penulis.\n\nTag: buku";
  const chapter = {
    article,
    article_status: "siap",
    stock_counts: {},
  } as unknown as Chapter;
  expect(cronJobs("VIDEO_KALIMAT", chapter, s)).toEqual(["VIDEO_KALIMAT"]);
  expect(
    cronJobs("VIDEO_KALIMAT", { ...chapter, sentence_video: "{}" }, s),
  ).toEqual([]);
  const p = emptyNewsProduction(),
    news = newsFixture().article;
  expect(newsPrerequisite("VIDEO_KALIMAT", p, s, news)).toBeNull();
  p.outputs.VIDEO_KALIMAT = { source: "IMAGE_VERTICAL" };
  expect(newsStageDone("VIDEO_KALIMAT", p, s, news)).toBe(false);
  p.outputs.VIDEO_KALIMAT = { source: "ANIMASI_2D", mode: "anim2d" };
  expect(newsStageDone("VIDEO_KALIMAT", p, s, news)).toBe(true);
});

it("timing per huruf ElevenLabs menjadi kata dan frasa caption", () => {
  const text = "Halo, dunia. Apa kabar?";
  const starts = [...text].map((_, i) => i * 0.1);
  const words = charsToWords(text, {
    characters: [...text],
    character_start_times_seconds: starts,
    character_end_times_seconds: starts.map((t) => t + 0.1),
  });
  expect(words.map((w) => [w.w, w.p])).toEqual([
    ["Halo", ","],
    ["dunia", "."],
    ["Apa", ""],
    ["kabar", "?"],
  ]);
  expect(words[1].s).toBeCloseTo(0.6);
  const chunks = chunkWords(words);
  expect(chunks.map((c) => c.words.length)).toEqual([2, 2]);
  expect(chunks[0].e).toBeCloseTo(words[2].s);
});

it("frame digambar tanpa browser di kedua format, termasuk saat kamera zoom", () => {
  const script = sanitizeScript(
    {
      ...raw,
      scenes: [
        { ...raw.scenes[0], focus: "hero" },
        raw.scenes[1],
        raw.scenes[2],
      ],
    },
    "x",
  );
  for (const [W, H] of [
    [720, 1280],
    [1280, 720],
  ]) {
    const video = {
      W,
      H,
      brand: "nus",
      world: script.world,
      ...evenTimeline(script),
    };
    setVideo(video);
    for (const t of [0, 1.2, video.scenes[1].start + 0.3, video.total - 0.2]) {
      const svg = renderFrame(t);
      expect(svg).not.toContain("<text");
      // opacity pada bentuk tunggal memicu panic resvg bila jauh di luar kanvas
      expect(svg).not.toMatch(
        /<(rect|circle|polygon|ellipse|path|line)\b[^>]* opacity="/,
      );
      const image = new Resvg(svg, {
        font: { loadSystemFonts: false },
      }).render();
      expect([image.width, image.height]).toEqual([W, H]);
    }
  }
});
