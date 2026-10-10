import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import {
  generateReadyPost,
  generateDirectCarousel,
  generateTemplatePost,
} from "../src/worker/posting-images";
import {
  normalizeContentType,
  contentStages,
  type ContentType,
} from "../src/server/content-type-domain";
import { nextBookJob, nextNewsJob } from "../src/server/content-plan";
import {
  DEFAULT_BOOK_SETTINGS,
  normalizeBookSettings,
} from "../src/server/book-settings";
import {
  emptyNewsProduction,
  newsPrerequisite,
} from "../src/server/news-production-domain";
import { newsFixture } from "./fixtures/news";
import type { Chapter } from "../src/server/store";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
async function fixture() {
  const work = await mkdtemp(path.join(os.tmpdir(), "ncpost-ready-post-"));
  dirs.push(work);
  const generate = vi.fn(
    async (_prompt: string, _work: string, file: string) => {
      await writeFile(
        file,
        await sharp({
          create: { width: 400, height: 300, channels: 3, background: "red" },
        })
          .png()
          .toBuffer(),
      );
      return { width: 400, height: 300, thread: "mock", output: file };
    },
  );
  return { work, generate };
}
function directType(): ContentType {
  return {
    id: 8,
    ...normalizeContentType({
      name: "Carousel langsung",
      engine: "book",
      outputs: ["PANEL"],
      settings: {
        ...DEFAULT_BOOK_SETTINGS,
        managed: true,
        carouselMode: "direct",
        panelVertical: null,
        stockKinds: [],
      },
    }),
  };
}
it("direct carousel skips stock generation and permits rendering from an approved article", () => {
  const t = directType();
  expect([...contentStages(t)]).toEqual(["ARTICLE", "PANEL"]);
  expect(t.settings?.stockKinds).toEqual([]);
  expect(t.settings?.panelHorizontal).toBe("IMAGE_HORIZONTAL");
  const c = {
    article:
      "# Judul\n\n## Hook\n\nHook.\n\nSatu.\n\nDua.\n\nTiga.\n\nEmpat.\n\nLima.\n\nBerdasarkan buku Buku, Penulis.\n\nTag: buku",
    article_status: "siap",
    stock_counts: {},
  } as Chapter;
  expect(nextBookJob(t, c, t.settings!, [])).toBe("PANEL");
  const p = emptyNewsProduction();
  expect(
    newsPrerequisite("PANEL", p, t.settings!, newsFixture().article),
  ).toBeNull();
  expect(nextNewsJob(t, newsFixture().article, t.settings!, p)).toBe("PANEL");
});
it("template carousel keeps its existing stock prerequisites", () => {
  const t = directType();
  t.settings!.carouselMode = "template";
  expect(contentStages(t).has("IMAGES_PANEL")).toBe(true);
  expect(
    newsPrerequisite(
      "PANEL",
      emptyNewsProduction(),
      t.settings!,
      newsFixture().article,
    ),
  ).toContain("gambar");
});
it("rejects unknown generation modes and preserves chosen modes during normalization", () => {
  expect(() => normalizeBookSettings({ carouselMode: "unknown" })).toThrow(
    "Cara pembuatan",
  );
  expect(() => normalizeBookSettings({ singleImageMode: "unknown" })).toThrow(
    "Cara pembuatan",
  );
  expect(
    normalizeBookSettings({
      ...directType().settings,
      singleImageMode: "template",
    }),
  ).toMatchObject({
    stockKinds: [],
    carouselMode: "direct",
    singleImageMode: "template",
  });
});
it("single direct image preserves native dimensions and text without padding or cropping", async () => {
  const { work, generate } = await fixture();
  const file = path.join(work, "final.jpg");
  const lab = {
    id: 5,
    prompt: "Ikuti logo dan warna merek",
    images: ["/private/reference.png", "/private/logo.png"],
  };
  const result = await generateReadyPost({
    file,
    work,
    title: "Judul",
    text: "Konten penting",
    lab,
    generate,
  });
  expect(result).toMatchObject({ width: 400, height: 300, mode: "direct" });
  expect(generate.mock.calls[0][0]).toBe(lab.prompt);
  expect(generate.mock.calls[0][0]).not.toContain("1080 × 1350");
  expect(generate.mock.calls[0][0]).toContain(lab.prompt);
  expect((generate.mock.calls[0] as any)[4]).toEqual(lab.images);
  expect(await sharp(file).metadata()).toMatchObject({
    width: 400,
    height: 300,
    format: "jpeg",
  });
  const pixel = await sharp(file)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer();
  expect(pixel[0]).toBeGreaterThan(240);
  expect(pixel[1]).toBeLessThan(10);
  expect(pixel[2]).toBeLessThan(10);
});
it("carousel generates each paragraph and a closing slide with the same static references", async () => {
  const { work, generate } = await fixture();
  const lab = { id: 5, prompt: "Gaya merek", images: ["/private/logo.png"] };
  const labFor = vi.fn(async (_kind: string, text: string) => ({
    ...lab,
    prompt: lab.prompt + "\n" + text,
  }));
  const result = await generateDirectCarousel({
    dir: work,
    work,
    title: "Judul",
    paragraphs: ["Paragraf pertama", "Paragraf kedua"],
    footer: "Buku contoh",
    kind: "IMAGE_LAB_5_V",
    labFor,
    generate,
  });
  expect(result.panels).toHaveLength(2);
  expect(generate).toHaveBeenCalledTimes(3);
  for (let i = 0; i < 3; i++) {
    expect(generate.mock.calls[i][0]).toContain(`Slide ${i + 1} dari 3`);
    expect((generate.mock.calls[i] as any)[4]).toEqual(lab.images);
  }
  expect(labFor).toHaveBeenCalledOnce();
  for (const call of generate.mock.calls)
    expect(call[0]).not.toContain("__NCPOST_SLIDE_");
  expect(result.closing).toContain("03-slide-penutup.jpg");
  expect(await sharp(result.closing).metadata()).toMatchObject({
    width: 1080,
    height: 1350,
  });
});
it("single-image template adds article text after a text-free background request", async () => {
  const { work, generate } = await fixture();
  const result = await generateTemplatePost({
    file: path.join(work, "card.jpg"),
    work,
    title: "Judul",
    text: "Teks lengkap artikel yang ditempatkan melalui template.",
    footer: "Buku · Bagian 1",
    kind: "IMAGE_HORIZONTAL",
    generate,
  });
  expect(result.mode).toBe("template");
  expect(generate.mock.calls[0][0]).toContain("Jangan menambahkan teks");
  expect(await sharp(result.file).metadata()).toMatchObject({
    width: 1080,
    height: 1350,
    format: "jpeg",
  });
});

it("a failed new carousel keeps previous files intact and does not return a partial manifest", async () => {
  const { work, generate } = await fixture();
  const previous = path.join(work, "01-panel.jpg");
  await writeFile(previous, "previous result");
  generate
    .mockImplementationOnce(async (_prompt, _work, file) => {
      await writeFile(
        file,
        await sharp({
          create: { width: 10, height: 10, channels: 3, background: "white" },
        })
          .png()
          .toBuffer(),
      );
      return { width: 10, height: 10, thread: "test", output: file };
    })
    .mockRejectedValueOnce(Error("Provider failed"));
  await expect(
    generateDirectCarousel({
      dir: work,
      work,
      filePrefix: "direct-r2-j88-",
      title: "Judul",
      paragraphs: ["Teks"],
      footer: "Buku",
      kind: "IMAGE_HORIZONTAL",
      labFor: async () => null,
      generate,
    }),
  ).rejects.toThrow("Provider failed");
  expect((await readFile(previous)).toString()).toBe("previous result");
});

it("configured carousel uses first and next prompts with native image size and no implicit closing", async () => {
  const { work, generate } = await fixture();
  const labFor = vi.fn().mockResolvedValue({
    id: 1,
    prompt: "Sampul",
    rawPrompt: "Sampul {{kalimat}}",
    images: [],
    config: {
      usage: "carousel",
      promptNext: "Halaman {{nomor_unit}} {{kalimat}}",
      unit: "sentence",
    },
  });
  const result = await generateDirectCarousel({
    dir: work,
    work,
    title: "Judul",
    paragraphs: ["Satu.", "Dua."],
    footer: "Sumber",
    kind: "IMAGE_LAB_1_V",
    labFor,
    generate,
    variables: (i) => ({
      kalimat: i ? "Dua." : "Satu.",
      nomor_unit: String(i + 1),
    }),
  });
  expect(labFor).toHaveBeenCalledTimes(1);
  expect(result.panels).toHaveLength(2);
  expect(result.closing).toBe("");
  expect(generate.mock.calls.map((call) => call[0])).toEqual([
    "Sampul Satu.",
    "Halaman 2 Dua.",
  ]);
  for (const panel of result.panels)
    expect(await sharp(panel.file).metadata()).toMatchObject({
      width: 400,
      height: 300,
    });
});
