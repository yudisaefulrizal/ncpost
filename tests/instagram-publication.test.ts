import type { Store as StoreType } from "../src/server/store";
import { expect, it, vi } from "vitest";
import { sendInstagramPublication } from "../src/worker/instagram-publication";
it.each(["POST_IG", "REELS_IG"] as const)(
  "persists the new %s request before sending a repost",
  async (kind) => {
    const store = { setPost: vi.fn(), setReels: vi.fn() };
    const save = kind === "POST_IG" ? store.setPost : store.setReels;
    const send = vi.fn(async () => {
      expect(save).toHaveBeenLastCalledWith(1, {
        status: "processing",
        requestId: "new-request",
      });
      return { status: "published", mediaId: "new-media" };
    });
    await sendInstagramPublication(store, 1, kind, "new-request", send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith(1, {
      status: "published",
      requestId: "new-request",
      mediaId: "new-media",
    });
  },
);
it("marks an uncertain repost unknown instead of preserving the previous published state", async () => {
  const store = { setPost: vi.fn(), setReels: vi.fn() };
  const send = vi.fn().mockRejectedValue(Error("timeout"));
  await expect(
    sendInstagramPublication(store, 1, "POST_IG", "new-request", send),
  ).rejects.toThrow("timeout");
  expect(store.setPost).toHaveBeenLastCalledWith(1, {
    status: "unknown",
    requestId: "new-request",
  });
  expect(send).toHaveBeenCalledTimes(1);
});

it.each(["POST_IG", "REELS_IG"] as const)(
  "only permits a published %s to be enqueued again with an explicit repost",
  async (kind) => {
    const { Store } = await import("../src/server/store");
    const query = vi.fn(async (sql: string) =>
      sql.includes("FROM content_types")
        ? [
            [
              {
                id: 1,
                name: "Konten",
                engine: "book",
                outputs: ["PANEL", "VIDEO_KALIMAT"],
                settings: null,
              },
            ],
          ]
        : [{ insertId: 12 }],
    );
    const store = Object.create(Store.prototype) as StoreType;
    (store as any).db = { query };
    (store as any).tx = (fn: any) => fn({ query });
    const chapter = {
      id: 1,
      revision: 2,
      panel_status: "tersedia",
      post_status: "published",
      reels_status: "published",
      sentence_video: "{}",
    };
    store.chapter = vi.fn().mockResolvedValue(chapter);
    await expect(store.enqueue(1, kind)).rejects.toThrow("diposting");
    expect(await store.enqueue(1, kind, true)).toBe(12);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("INSERT INTO jobs"),
      [1, kind, 2, 1],
    );
    chapter.post_status = "unknown";
    chapter.reels_status = "unknown";
    await expect(store.enqueue(1, kind, true)).rejects.toThrow("belum pasti");
    chapter.post_status = "processing";
    chapter.reels_status = "processing";
    await expect(store.enqueue(1, kind, true)).rejects.toThrow(
      "sedang diproses",
    );
  },
);
