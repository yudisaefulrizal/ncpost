import { expect, it, vi } from "vitest";
import { retryImageGeneration } from "../src/server/image-retry";
import { workerConcurrency } from "../src/server/domain";
import { cancellableGeneration } from "../src/server/generation-cancel";
it("caps worker capacity at two including existing larger environment values", () => {
  for (const input of [undefined, "3", "99", "bad", "Infinity", "0"])
    expect(workerConcurrency(input)).toBe(2);
  expect(workerConcurrency("1")).toBe(1);
});
it("continues when the third image attempt succeeds", async () => {
  const generate = vi
    .fn()
    .mockRejectedValueOnce(Error("fail"))
    .mockRejectedValueOnce(Error("fail"))
    .mockResolvedValue("image");
  const wait = vi.fn().mockResolvedValue(undefined);
  expect(await retryImageGeneration(generate, wait)).toBe("image");
  expect(generate).toHaveBeenCalledTimes(3);
  expect(wait).toHaveBeenCalledTimes(2);
});
it("stops after two retries and preserves the final cause", async () => {
  const generate = vi.fn().mockRejectedValue(Error("final cause"));
  await expect(retryImageGeneration(generate, async () => {})).rejects.toThrow(
    "final cause",
  );
  expect(generate).toHaveBeenCalledTimes(3);
});
it("does not repeat a successful image", async () => {
  const generate = vi.fn().mockResolvedValue("image");
  await retryImageGeneration(generate);
  expect(generate).toHaveBeenCalledOnce();
});
it("does not retry when Stop cancels during the retry delay", async () => {
  vi.useFakeTimers();
  const db = {
    query: vi
      .fn()
      .mockResolvedValueOnce([[{ state: "running", cancel_version: 0 }]])
      .mockResolvedValue([[{ state: "cancelled", cancel_version: 1 }]]),
  };
  const generate = vi.fn().mockRejectedValue(Error("fail"));
  const task = cancellableGeneration(db, "jobs", 1, async () => {
    await retryImageGeneration(generate);
  });
  const result = expect(task).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(1500);
  await result;
  expect(generate).toHaveBeenCalledOnce();
  vi.useRealTimers();
});
it("waits ten seconds before retrying a failed image", async () => {
  const starts: number[] = [];
  const generate = vi.fn(async () => {
    starts.push(Date.now());
    if (starts.length === 1) throw Error("fail");
    return "image";
  });
  expect(await retryImageGeneration(generate)).toBe("image");
  expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(10000);
  expect(generate).toHaveBeenCalledTimes(2);
}, 15000);
