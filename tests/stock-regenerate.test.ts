import { expect, it, vi } from "vitest";
import {
  enqueueStockRegeneration,
  regenerateStock,
} from "../src/server/stock-regenerate";
vi.mock("../src/server/media-stock", () => ({
  sharedMedia: vi.fn(async (options) => options.generate("temporary.jpg")),
}));
vi.mock("../src/server/lab-images", () => ({
  labAttachments: () => [],
  labImageFile: vi.fn(),
}));
import { sharedMedia } from "../src/server/media-stock";
vi.mock("sharp", () => ({
  default: () => ({
    metadata: async () => ({ width: 100, height: 200 }),
    rotate() {
      return this;
    },
    resize() {
      return this;
    },
    jpeg() {
      return this;
    },
    toFile: vi.fn(),
  }),
}));
const stock = {
  file: "output/stock/test.jpg",
  prompt: "Exact resolved production prompt",
  identity_name: "preset__vertikal",
  source_text: "A sentence",
  preset_id: null,
};
function database(active = false, missing = false) {
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi
      .fn()
      .mockResolvedValueOnce([missing ? [] : [stock]])
      .mockResolvedValueOnce([active ? [{ id: 7 }] : []])
      .mockResolvedValueOnce([{ insertId: 8 }]),
  };
  return { connection, db: { getConnection: async () => connection } as any };
}
it("queues one image with its production prompt", async () => {
  const { db, connection } = database();
  expect(await enqueueStockRegeneration(db, 4)).toBe(8);
  expect(connection.query.mock.calls[2][1]).toContain(stock.prompt);
  expect(connection.commit).toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalled();
});
it("reuses an already queued regeneration", async () => {
  const { db, connection } = database(true);
  expect(await enqueueStockRegeneration(db, 4)).toBe(7);
  expect(connection.query).toHaveBeenCalledTimes(2);
});
it("rejects a missing stock without inserting work", async () => {
  const { db, connection } = database(false, true);
  await expect(enqueueStockRegeneration(db, 4)).rejects.toThrow("prompt");
  expect(connection.rollback).toHaveBeenCalled();
});
it("forces replacement of only the selected stock using its exact prompt", async () => {
  const generate = vi.fn().mockResolvedValue({});
  const db = { query: vi.fn().mockResolvedValue([[stock]]) } as any;
  await regenerateStock(db, 4, "/tmp/work", generate);
  expect(sharedMedia).toHaveBeenCalledWith(
    expect.objectContaining({
      force: true,
      identity: ["preset", "vertikal"],
      text: stock.source_text,
      prompt: stock.prompt,
    }),
  );
  expect(generate).toHaveBeenCalledWith(
    stock.prompt,
    "/tmp/work",
    "/tmp/work/regenerated.jpg",
    "bebas",
    [],
  );
});
