import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { sharedMedia, stockName, stockPart } from "../src/server/media-stock";
import { outputRoot } from "../src/server/output-paths";
import { mediaResetFolders, MEDIA_RESET_SQL } from "../src/server/media-reset";
import { replaceMediaReferences } from "../src/server/preset-stock-rename";
const identity = ["Uji stok bersama"];
beforeEach(() => vi.stubEnv("NCPOST_TEST", "true"));
afterEach(async () => {
  for (const category of ["stock", "stock-audio"])
    await rm(path.join(outputRoot(), category, stockPart(identity[0])), {
      recursive: true,
      force: true,
    });
  vi.unstubAllEnvs();
});
const jpeg = (file: string) =>
  sharp({ create: { width: 24, height: 32, channels: 3, background: "red" } })
    .jpeg()
    .toFile(file);
it("limits the base name to 200 characters with explicit separators and no slide/job identifiers", () => {
  expect(stockName(["Edge TTS", "id-ID-ArdiNeural"], "Teks narasi")).toBe(
    "edge-tts__id-id-ardineural__teks-narasi",
  );
  const name = stockName(identity, "Kalimat ".repeat(100));
  expect(name).toHaveLength(200);
  expect(`${name}.jpg`).toHaveLength(204);
});
it("shares one image across repeated/concurrent requests and creates another for changed text", async () => {
  const generate = vi.fn(jpeg);
  const args = {
    category: "image" as const,
    identity,
    text: "Paragraf pertama",
    generate,
  };
  const [first, second] = await Promise.all([
    sharedMedia(args),
    sharedMedia(args),
  ]);
  expect(first).toBe(second);
  expect(generate).toHaveBeenCalledOnce();
  const changed = await sharedMedia({ ...args, text: "Paragraf berubah" });
  expect(changed).not.toBe(first);
  expect(await readFile(first)).toBeTruthy();
});
it("reuses any existing supported extension and preserves old stock after failed regeneration", async () => {
  const dir = path.join(outputRoot(), "stock", stockPart(identity[0]));
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, stockName(identity, "Kalimat") + ".png");
  const original = await sharp({
    create: { width: 24, height: 32, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  await writeFile(file, original);
  const generate = vi.fn(jpeg);
  const args = {
    category: "image" as const,
    identity,
    text: "Kalimat",
    generate,
  };
  expect(await sharedMedia(args)).toBe(file);
  expect(generate).not.toHaveBeenCalled();
  await expect(
    sharedMedia({
      ...args,
      force: true,
      generate: async () => {
        throw Error("Provider gagal");
      },
    }),
  ).rejects.toThrow("Provider gagal");
  expect(await readFile(file)).toEqual(original);
  const replacement = await sharedMedia({ ...args, force: true });
  expect(path.extname(replacement)).toBe(".jpg");
  expect(await sharp(replacement).metadata()).toMatchObject({ format: "jpeg" });
  expect(await readdir(dir)).toEqual([path.basename(replacement)]);
});
it("audio uses actual narration and reuses its stock", async () => {
  const generate = vi.fn(async (file) => {
    await writeFile(file, Buffer.alloc(200, 1));
  });
  const args = {
    category: "audio" as const,
    identity,
    text: "Narasi lengkap",
    generate,
  };
  expect(await sharedMedia(args)).toBe(await sharedMedia(args));
  expect(generate).toHaveBeenCalledOnce();
});
it("updates nested references without changing slide order or unrelated files", () => {
  const before = {
    panels: [{ file: "old.jpg" }, { file: "other.jpg" }],
    audio: { file: "old.jpg" },
  };
  expect(
    replaceMediaReferences(before, new Map([["old.jpg", "new.jpg"]])),
  ).toEqual({
    panels: [{ file: "new.jpg" }, { file: "other.jpg" }],
    audio: { file: "new.jpg" },
  });
});
it("reset preserves references, Lab history, backups and articles", async () => {
  const dir = path.join(outputRoot(), "reset-fixture");
  for (const name of [
    "stock",
    "stock-audio",
    "berita/media",
    "lab",
    "lab-references",
    "media-backups",
  ])
    await mkdir(path.join(dir, name), { recursive: true });
  try {
    expect(
      (await mediaResetFolders(dir)).map((p) => path.relative(dir, p)).sort(),
    ).toEqual(["berita/media", "stock", "stock-audio"]);
    const sql = MEDIA_RESET_SQL.join("\n");
    expect(sql).not.toMatch(
      /DELETE FROM (?:chapters|news_articles|lab_prompts|lab_images|book_cron|cron_schedules)\b/,
    );
    expect(sql).not.toMatch(/article\s*=/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("separates image orientations in filenames within the same preset folder", async () => {
  const generate = vi.fn(jpeg);
  const args = { category: "image" as const, text: "Kalimat sama", generate };
  const vertical = await sharedMedia({
    ...args,
    identity: [...identity, "vertikal"],
  });
  const horizontal = await sharedMedia({
    ...args,
    identity: [...identity, "horizontal"],
  });
  expect(path.dirname(vertical)).toBe(path.dirname(horizontal));
  expect(path.basename(vertical)).toBe(
    "uji-stok-bersama__vertikal__kalimat-sama.jpg",
  );
  expect(path.basename(horizontal)).toBe(
    "uji-stok-bersama__horizontal__kalimat-sama.jpg",
  );
  expect(generate).toHaveBeenCalledTimes(2);
  expect(
    await sharedMedia({ ...args, identity: [...identity, "vertikal"] }),
  ).toBe(vertical);
  expect(generate).toHaveBeenCalledTimes(2);
});
