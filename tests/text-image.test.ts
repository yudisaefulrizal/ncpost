import sharp from "sharp";
import { outputRoot } from "../src/server/output-paths";
import { afterEach, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import path from "node:path";
import {
  generateWholeTextImage,
  wholeTextImagePrompt,
} from "../src/worker/text-image";
import { chapterDir } from "../src/server/output-paths";
const chapter = {
  id: 991280,
  book: "__test-whole-text",
  title: "Seluruh artikel",
  part_number: 1,
};
afterEach(() => {
  rmSync(chapterDir(chapter), { recursive: true, force: true });
  rmSync(path.join(outputRoot(), "stock", "infografis"), {
    recursive: true,
    force: true,
  });
  vi.unstubAllEnvs();
});
it("sends the entire article in one image request and records a shared stock result", async () => {
  vi.stubEnv("NCPOST_TEST", "true");
  const article =
    "# Judul\n\n## Hook\n\nParagraf pertama.\n\nParagraf terakhir.\n\nBerdasarkan buku Contoh.\n\nTag: #contoh";
  const generate = vi.fn(async (_prompt, _cwd, file) => {
    await sharp({
      create: { width: 10, height: 15, channels: 3, background: "white" },
    })
      .jpeg()
      .toFile(file);
    return { width: 10, height: 15, thread: "fixture", output: file };
  });
  const result = await generateWholeTextImage(
    chapter,
    article,
    "/tmp/text-image-test",
    4,
    88,
    generate,
  );
  expect(generate).toHaveBeenCalledExactlyOnceWith(
    wholeTextImagePrompt(article),
    "/tmp/text-image-test",
    expect.stringContaining(".pending-"),
    "bebas",
  );
  expect(result).toMatchObject({
    file: expect.stringContaining("stock/infografis/infografis__"),
    prompt: expect.stringContaining(article),
    width: 10,
    height: 15,
  });
});
it("does not return a successful result if generation fails", async () => {
  vi.stubEnv("NCPOST_TEST", "true");
  await expect(
    generateWholeTextImage(
      chapter,
      "Artikel",
      "/tmp/text-image-test",
      5,
      89,
      vi.fn().mockRejectedValue(Error("Provider gagal")),
    ),
  ).rejects.toThrow("Provider gagal");
  expect(() => wholeTextImagePrompt(" ")).toThrow("Teks artikel");
});
