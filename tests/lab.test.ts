import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import {
  LabStore,
  labFinalPrompt,
  labInput,
  type LabRun,
} from "../src/server/lab";
import { runLabJob } from "../src/worker/lab";
const id = 991273;
const work = path.join(process.cwd(), "output/.test/lab", String(id));
beforeEach(() => vi.stubEnv("NCPOST_TEST", "true"));
afterEach(() => {
  rmSync(work, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
const draft = {
  kind: "article",
  name: "Test",
  prompt: "Instruksi",
  input: "Tema",
  orientation: "bebas",
};
it("validates kinds, prompt lengths and image orientations", () => {
  expect(labInput(draft)).toEqual({
    ...draft,
    referenceKey: null,
    referenceImage: null,
    logoImage: null,
    referenceImages: [],
  });
  expect(() => labInput({ ...draft, kind: "shell" })).toThrow("Jenis Lab");
  expect(() => labInput({ ...draft, prompt: " " })).toThrow("Prompt wajib");
  expect(() => labInput({ ...draft, prompt: "x".repeat(30001) })).toThrow(
    "30.000",
  );
  expect(() => labInput({ ...draft, orientation: "diagonal" })).toThrow(
    "Orientasi",
  );
  expect(labFinalPrompt("Instruksi", "Tema")).toBe(
    "Instruksi\n\nInput uji:\nTema",
  );
});
it("queues a snapshot without modifying the saved production prompts", async () => {
  const query = vi.fn().mockResolvedValue([{ insertId: 7 }]);
  const store = new LabStore({ query } as any);
  expect(await store.enqueue(draft)).toBe(7);
  expect(query).toHaveBeenCalledWith(
    expect.stringContaining("INSERT INTO lab_runs"),
    [
      "article",
      "Test",
      "Instruksi",
      "Tema",
      "bebas",
      null,
      "Instruksi\n\nInput uji:\nTema",
      null,
      null,
      "[]",
    ],
  );
  expect(query).toHaveBeenCalledTimes(1);
});
it("claims queued jobs transactionally and rolls back failed claims", async () => {
  const connection = {
    query: vi.fn().mockResolvedValue([[]]),
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
  const store = new LabStore({
    query: vi.fn(),
    getConnection: vi.fn().mockResolvedValue(connection),
  } as any);
  expect(await store.claim()).toBeUndefined();
  expect(connection.query).toHaveBeenCalledWith(
    expect.stringContaining("FOR UPDATE SKIP LOCKED"),
  );
  expect(connection.commit).toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalled();
  connection.query.mockRejectedValueOnce(Error("database unavailable"));
  await expect(store.claim()).rejects.toThrow("database unavailable");
  expect(connection.rollback).toHaveBeenCalled();
});
function workerSetup(kind = "article") {
  const job = {
    ...draft,
    id,
    kind,
    state: "running",
    result: null,
    error: null,
  } as LabRun;
  const store = { heartbeat: vi.fn(), complete: vi.fn(), fail: vi.fn() } as any;
  const providers = {
    codex: vi.fn().mockResolvedValue("Artikel hasil uji"),
    generateCodexImage: vi.fn().mockResolvedValue({
      width: 1080,
      height: 1920,
      thread: "test",
      output: path.join(work, "image.jpg"),
    }),
  };
  return { job, store, providers };
}
it("runs article experiments with the exact snapshot and stores the actual output", async () => {
  const { job, store, providers } = workerSetup();
  await runLabJob(store, job, providers);
  expect(providers.codex).toHaveBeenCalledWith(
    "Instruksi\n\nInput uji:\nTema",
    work,
  );
  expect(store.complete).toHaveBeenCalledWith(id, {
    text: "Artikel hasil uji",
  });
  expect(readFileSync(path.join(work, "article.md"), "utf8")).toBe(
    "Artikel hasil uji",
  );
  expect(providers.generateCodexImage).not.toHaveBeenCalled();
});
it("uses the image adapter with the requested orientation", async () => {
  const { job, store, providers } = workerSetup("image");
  job.orientation = "vertikal";
  await runLabJob(store, job, providers);
  expect(providers.generateCodexImage).toHaveBeenCalledWith(
    "Instruksi\n\nInput uji:\nTema",
    work,
    path.join(work, "image.jpg"),
    "vertikal",
    [],
  );
  expect(store.complete).toHaveBeenCalledWith(id, {
    image: true,
    width: 1080,
    height: 1920,
  });
  expect(providers.codex).not.toHaveBeenCalled();
});
it("reports provider failures and never marks them completed", async () => {
  const { job, store, providers } = workerSetup();
  providers.codex.mockRejectedValue(Error("Provider timeout"));
  await runLabJob(store, job, providers);
  expect(store.fail).toHaveBeenCalledWith(id, "Provider timeout");
  expect(store.complete).not.toHaveBeenCalled();
});

it("loads production references and resolves their variables for comparable experiments", async () => {
  const { labReferences, resolveLabPrompt } = await import(
    "../src/server/lab-references"
  );
  const { readPrompt } = await import("../src/server/prompts");
  const articles = labReferences("article");
  expect(articles.find((r) => r.id === "book")?.prompt).toBe(
    readPrompt("artikel/aturan.md"),
  );
  const images = labReferences("image");
  expect(images.length).toBe(7);
  for (const ref of images) {
    expect(ref.prompt).toBe(readPrompt(ref.file));
    expect(resolveLabPrompt("image", ref.id, ref.prompt)).not.toMatch(
      /\{\{\w+\}\}/,
    );
  }
  expect(resolveLabPrompt("article", "book", "Aturan hasil tuning")).toContain(
    "Aturan hasil tuning",
  );
  expect(() => resolveLabPrompt("article", "IMAGE_VERTICAL", "x")).toThrow(
    "Referensi",
  );
  expect(() =>
    resolveLabPrompt("image", "IMAGE_VERTICAL", "{{unknown}}"),
  ).toThrow("Placeholder");
});
it("stores the resolved reference alongside the editable template", async () => {
  const query = vi.fn().mockResolvedValue([{ insertId: 8 }]);
  await new LabStore({ query } as any).enqueue({
    ...draft,
    input: "",
    kind: "image",
    referenceKey: "IMAGE_VERTICAL",
    prompt: "Gambar {{teks}}",
  });
  const params = query.mock.calls[0][1];
  expect(params[2]).toBe("Gambar {{teks}}");
  expect(params[5]).toBe("IMAGE_VERTICAL");
  expect(params[6]).toContain("Menghargai sudut pandang");
});
