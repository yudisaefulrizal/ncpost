import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, rmdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { generateCodexImage } from "../src/server/codex-image";
import { generateStock } from "../src/worker/stock-generator";
import { ROOT } from "../src/server/config";
vi.mock("../src/server/codex-image", () => ({ generateCodexImage: vi.fn() }));
afterEach(() => vi.resetAllMocks());
it("generates a Lab lane with its exact prompt, static attachments, and orientation, keeping assets separate from built-in styles", async () => {
  const work = await mkdtemp(path.join(os.tmpdir(), "ncpost-lab-stock-"));
  const kind = "IMAGE_LAB_991285_V";
  let file: string | undefined;
  const store = {
    addAsset: vi.fn(async (_kind: string, name: string) => {
      file = path.join(ROOT, name);
      return 91;
    }),
  };
  vi.mocked(generateCodexImage).mockImplementation(
    async (_prompt, _cwd, output) => {
      await sharp({
        create: { width: 10, height: 15, channels: 3, background: "white" },
      })
        .jpeg()
        .toFile(output);
      return { width: 1080, height: 1920, output, thread: "fixture" };
    },
  );
  try {
    const id = await generateStock(
      store as any,
      kind,
      "Kalimat produksi",
      "",
      work,
      1,
      {
        id: 991285,
        prompt: "Gaya merek Kalimat produksi",
        images: ["/private/reference.png", "/private/logo.png"],
      },
    );
    expect(id).toBe(91);
    expect(generateCodexImage).toHaveBeenCalledWith(
      "Gaya merek Kalimat produksi\n\nOrientasi gambar: vertikal 9:16.",
      work,
      expect.any(String),
      "vertikal",
      ["/private/reference.png", "/private/logo.png"],
    );
    expect(store.addAsset).toHaveBeenCalledWith(
      kind,
      expect.stringContaining(`output/stock/${kind}/`),
      "Kalimat produksi",
      expect.stringContaining("Gaya merek"),
    );
    expect(await sharp(await readFile(file!)).metadata()).toMatchObject({
      format: "jpeg",
    });
  } finally {
    await rm(work, { recursive: true, force: true });
    if (file) {
      await rm(file, { force: true });
      await rmdir(path.dirname(file)).catch(() => {});
    }
  }
});
