import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { rm, stat, symlink } from "node:fs/promises";
import sharp from "sharp";
import {
  labImageId,
  labImageFile,
  saveLabImage,
  LAB_IMAGE_LIMIT,
} from "../src/server/lab-images";
import { LabStore, labInput, type LabRun } from "../src/server/lab";
import { runLabJob } from "../src/worker/lab";
import { generateCodexImage } from "../src/server/codex-image";
import * as providers from "../src/server/providers";
import { outputRoot } from "../src/server/output-paths";
import path from "node:path";
const files: string[] = [];
const jobId = 991274;
beforeEach(() => vi.stubEnv("NCPOST_TEST", "true"));
afterEach(async () => {
  await Promise.all(files.splice(0).map((file) => rm(file, { force: true })));
  await rm(path.join(outputRoot(), "lab", String(jobId)), {
    recursive: true,
    force: true,
  });
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const draft = {
  kind: "image",
  name: "Referensi",
  prompt: "Ikuti gaya gambar referensi",
  input: "",
  orientation: "bebas",
};
async function upload() {
  const bytes = await sharp({
    create: { width: 10, height: 15, channels: 3, background: "red" },
  })
    .jpeg()
    .toBuffer();
  const id = await saveLabImage(bytes);
  const file = await labImageFile(id);
  files.push(file);
  return { id, file };
}
it("stores a private normalized image and rejects invalid uploads and paths", async () => {
  const { file } = await upload();
  expect((await stat(file)).mode & 0o777).toBe(0o600);
  expect(await sharp(file).metadata()).toMatchObject({
    format: "png",
    width: 10,
    height: 15,
  });
  await expect(saveLabImage(Buffer.from("not an image"))).rejects.toThrow();
  await expect(saveLabImage(Buffer.alloc(LAB_IMAGE_LIMIT + 1))).rejects.toThrow(
    "10 MB",
  );
  expect(() => labImageId("../../.env")).toThrow();
  const link = path.join(
    path.dirname(file),
    "00000000-0000-4000-8000-000000000000.png",
  );
  await symlink(file, link);
  files.push(link);
  await expect(labImageFile(path.basename(link))).rejects.toThrow();
});
it("snapshots the reference on a run and passes its private file to the image adapter", async () => {
  const { id, file } = await upload();
  const query = vi.fn().mockResolvedValue([{ insertId: jobId }]);
  await new LabStore({ query } as any).enqueue({
    ...draft,
    referenceImage: id,
  });
  expect(query.mock.calls[0][1][7]).toBe(id);
  const generate = vi.fn().mockResolvedValue({ width: 10, height: 15 });
  const store = { heartbeat: vi.fn(), complete: vi.fn(), fail: vi.fn() } as any;
  await runLabJob(
    store,
    { ...draft, id: jobId, reference_image: id } as LabRun,
    { codex: vi.fn(), generateCodexImage: generate },
  );
  expect(generate).toHaveBeenCalledWith(
    draft.prompt,
    expect.any(String),
    expect.any(String),
    "bebas",
    [file],
  );
  expect(store.fail).not.toHaveBeenCalled();
  expect(store.complete).toHaveBeenCalled();
});
it("rejects missing references before queueing and references on article prompts", async () => {
  const referenceImage = "00000000-0000-4000-8000-000000000001.png";
  const query = vi.fn();
  await expect(
    new LabStore({ query } as any).enqueue({ ...draft, referenceImage }),
  ).rejects.toThrow();
  expect(query).not.toHaveBeenCalled();
  expect(() => labInput({ ...draft, kind: "article", referenceImage })).toThrow(
    "hanya untuk Lab Gambar",
  );
});
it("attaches the actual file using the CLI image option without invoking a model", async () => {
  const run = vi
    .spyOn(providers, "runCli")
    .mockRejectedValue(Error("stop before model"));
  await expect(
    generateCodexImage("prompt", "/tmp", "/tmp/result.jpg", "bebas", [
      "/tmp/reference.png",
    ]),
  ).rejects.toThrow("stop before model");
  expect(run.mock.calls[0][1]).toEqual(
    expect.arrayContaining(["--image", "/tmp/reference.png"]),
  );
});

it("accepts binary uploads through the same JSON parsers as the app and serves the private preview", async () => {
  const { default: express } = await import("express");
  const { labRouter } = await import("../src/server/lab-routes");
  const app = express();
  app.use("/api/lab", express.json({ limit: "256kb" }));
  app.use(express.json({ limit: "64kb" }));
  app.use(
    "/api/lab",
    labRouter(() => ({ addImage: vi.fn() }) as any),
  );
  app.use((error: any, _req: any, res: any, _next: any) =>
    res.status(error.status || 400).json({ error: error.message }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  try {
    const address = server.address() as { port: number };
    const base = `http://127.0.0.1:${address.port}/api/lab/images`;
    const image = await sharp({
      create: { width: 12, height: 16, channels: 3, background: "blue" },
    })
      .webp()
      .toBuffer();
    const uploaded = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "image/webp" },
      body: new Uint8Array(image),
    });
    expect(uploaded.status).toBe(201);
    const { id } = (await uploaded.json()) as { id: string };
    files.push(await labImageFile(id));
    const preview = await fetch(`${base}/${id}`);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("cache-control")).toBe("private, no-store");
    expect(preview.headers.get("content-type")).toContain("image/png");
    expect(
      await sharp(Buffer.from(await preview.arrayBuffer())).metadata(),
    ).toMatchObject({ width: 12, height: 16 });
    const invalid = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: "invalid",
    });
    expect(invalid.status).toBe(400);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it("snapshots multiple attachments and sends them together with the unchanged prompt", async () => {
  const { id: reference, file: referenceFile } = await upload();
  const { id: logo, file: logoFile } = await upload();
  const referenceImages = [reference, logo];
  const query = vi.fn().mockResolvedValue([{ insertId: jobId }]);
  const db = new LabStore({ query } as any);
  await db.save({ ...draft, referenceImages });
  expect(JSON.parse(query.mock.calls[0][1].at(-3))).toEqual(referenceImages);
  await db.enqueue({ ...draft, referenceImages });
  expect(JSON.parse(query.mock.calls[1][1].at(-3))).toEqual(referenceImages);
  const generate = vi.fn().mockResolvedValue({ width: 400, height: 400 });
  const store = { heartbeat: vi.fn(), complete: vi.fn(), fail: vi.fn() } as any;
  await runLabJob(
    store,
    {
      ...draft,
      id: jobId,
      reference_images: JSON.stringify(referenceImages),
    } as LabRun,
    { codex: vi.fn(), generateCodexImage: generate },
  );
  expect(generate).toHaveBeenCalledWith(
    draft.prompt,
    expect.any(String),
    expect.any(String),
    "bebas",
    [referenceFile, logoFile],
  );
  expect(store.fail).not.toHaveBeenCalled();
  expect(store.complete).toHaveBeenCalled();
});

it("supports empty attachments and clearing old reference/logo choices", async () => {
  const { id: logo } = await upload();
  expect(labInput({ ...draft, logoImage: logo }).referenceImages).toEqual([
    logo,
  ]);
  expect(labInput(draft).referenceImages).toEqual([]);
  expect(
    labInput({ ...draft, logoImage: logo, referenceImages: [] })
      .referenceImages,
  ).toEqual([]);
  expect(() =>
    labInput({ ...draft, referenceImages: Array(9).fill(logo) }),
  ).toThrow("8 gambar");
  expect(() =>
    labInput({ ...draft, kind: "article", referenceImages: [logo] }),
  ).toThrow("hanya untuk Lab Gambar");
});
