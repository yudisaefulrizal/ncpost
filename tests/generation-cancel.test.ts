import { afterEach, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import {
  cancellableGeneration,
  generationSignal,
  watchGenerationChild,
  checkGeneration,
} from "../src/server/generation-cancel";
afterEach(() => vi.useRealTimers());
it("stops a child process when the job is cancelled", async () => {
  let state = "running";
  const db = { query: async () => [[{ state, cancel_version: 0 }]] };
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  let closed = false;
  const task = cancellableGeneration(db, "jobs", 1, async () => {
    const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      detached: true,
      stdio: "ignore",
    });
    watchGenerationChild(child);
    started();
    await new Promise<void>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", () => {
        closed = true;
        resolve();
      });
    });
    expect(() => checkGeneration()).toThrow("dibatalkan");
  });
  await ready;
  state = "cancelled";
  await task;
  expect(closed).toBe(true);
  expect(generationSignal()).toBeUndefined();
});
it("detects the cancellation token even when the job has already been retried", async () => {
  vi.useFakeTimers();
  let version = 0;
  const db = {
    query: async () => [[{ state: "running", cancel_version: version }]],
  };
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const task = cancellableGeneration(
    db,
    "jobs",
    1,
    async () => {
      started();
      await new Promise<void>((resolve) =>
        generationSignal()!.addEventListener("abort", () => resolve(), {
          once: true,
        }),
      );
      expect(() => checkGeneration()).toThrow("dibatalkan");
    },
    0,
  );
  await ready;
  version = 1;
  await vi.advanceTimersByTimeAsync(1000);
  await task;
});
it("never starts a job cancelled before the worker enters it", async () => {
  const run = vi.fn();
  await cancellableGeneration(
    { query: async () => [[{ state: "cancelled", cancel_version: 1 }]] },
    "jobs",
    1,
    run,
    0,
  );
  expect(run).not.toHaveBeenCalled();
});

it("cleans partial regeneration and preserves the existing image stock", async () => {
  vi.stubEnv("NCPOST_TEST", "true");
  const { sharedMedia } = await import("../src/server/media-stock");
  const { outputRoot } = await import("../src/server/output-paths");
  const { default: path } = await import("node:path");
  const { mkdir, writeFile, readFile, readdir, rm } = await import(
    "node:fs/promises"
  );
  const dir = path.join(outputRoot(), "stock/cancel-fixture");
  const file = path.join(dir, "cancel-fixture__vertikal__teks.jpg");
  await mkdir(dir, { recursive: true });
  await writeFile(file, "old image");
  let state = "running";
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  try {
    const task = cancellableGeneration(
      { query: async () => [[{ state, cancel_version: 0 }]] },
      "jobs",
      1,
      async () => {
        await expect(
          sharedMedia({
            category: "image",
            identity: ["cancel-fixture", "vertikal"],
            text: "Teks",
            force: true,
            generate: async (temporary) => {
              await writeFile(temporary, "partial image");
              started();
              await new Promise<void>((resolve) =>
                generationSignal()!.addEventListener("abort", () => resolve(), {
                  once: true,
                }),
              );
              checkGeneration();
            },
          }),
        ).rejects.toThrow("dibatalkan");
      },
    );
    await ready;
    state = "cancelled";
    await task;
    expect(await readFile(file, "utf8")).toBe("old image");
    expect(await readdir(dir)).toEqual([path.basename(file)]);
  } finally {
    await rm(dir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  }
});
