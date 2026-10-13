import { expect, it, vi } from "vitest";
import {
  averageImageDuration,
  recordImageTiming,
} from "../src/server/image-timing";
it("averages only valid individual generation durations", () => {
  expect(
    averageImageDuration([
      { duration_ms: 1000 },
      { duration_ms: 3000 },
      { duration_ms: NaN },
    ]),
  ).toBe(2000);
  expect(averageImageDuration([])).toBeNull();
});
it("serializes recording and removes everything except the newest 20 samples", async () => {
  const ids = Array.from({ length: 20 }, (_, i) => ({ id: 30 - i }));
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi
      .fn()
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([ids])
      .mockResolvedValueOnce([{}]),
  };
  await recordImageTiming(1200, "vertikal", {
    getConnection: async () => connection,
  } as any);
  expect(connection.query.mock.calls[0][0]).toContain("FOR UPDATE");
  expect(connection.query.mock.calls[3][1]).toEqual(ids.map((row) => row.id));
  expect(connection.commit).toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalled();
});
it("rolls back a failed recording", async () => {
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn().mockRejectedValue(new Error("database error")),
  };
  await expect(
    recordImageTiming(1200, "vertikal", {
      getConnection: async () => connection,
    } as any),
  ).rejects.toThrow("database error");
  expect(connection.rollback).toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalled();
});
