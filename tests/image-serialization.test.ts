import { afterEach, expect, it, vi } from "vitest";
import { generateCodexImage } from "../src/server/codex-image";
import { configureMediaStock } from "../src/server/media-stock";
import * as providers from "../src/server/providers";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("serializes image CLI calls across distinct presets and releases the slot on failure", async () => {
  vi.stubEnv("NCPOST_TEST", "true");
  configureMediaStock(undefined);
  let running = 0,
    peak = 0;
  const cli = vi.spyOn(providers, "runCli").mockImplementation(async () => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 20));
    running--;
    throw Error("model failure");
  });
  const results = await Promise.allSettled([
    generateCodexImage("preset one", "/tmp", "/tmp/unused-one.jpg", "vertikal"),
    generateCodexImage(
      "preset two",
      "/tmp",
      "/tmp/unused-two.jpg",
      "horizontal",
    ),
  ]);
  expect(peak).toBe(1);
  expect(cli).toHaveBeenCalledTimes(6);
  expect(results.every((result) => result.status === "rejected")).toBe(true);
});

vi.mock("../src/server/image-retry", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../src/server/image-retry")>();
  return {
    retryImageGeneration: (generate: () => Promise<unknown>) =>
      original.retryImageGeneration(generate, async () => {}),
  };
});
