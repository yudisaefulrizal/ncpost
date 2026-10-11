import { afterEach, expect, it, vi } from "vitest";
import { listQueue, queueAction } from "../src/server/queue";
import {
  ContentTypeStore,
  currentContentType,
} from "../src/server/content-types";
import { NewsMediaStore } from "../src/server/news-media-store";
import { NewsStore } from "../src/server/news-store";
import type { Store } from "../src/server/store";
afterEach(() => vi.restoreAllMocks());
const type = {
  id: 9,
  name: "Custom",
  engine: "book",
  outputs: [],
  settings: null,
} as any;
function fixture(job: any = {}) {
  const query = vi.fn().mockResolvedValue([[job]]);
  const store = {
    db: { query },
    enqueue: vi.fn().mockImplementation(async () => {
      expect(currentContentType()?.id).toBe(9);
      return 12;
    }),
  } as unknown as Store;
  vi.spyOn(ContentTypeStore.prototype, "get").mockResolvedValue(type);
  return { store, query };
}
it.each(["book", "news-article", "news-media"])(
  "cancels only queued %s jobs atomically",
  async (source) => {
    const { store, query } = fixture();
    query.mockResolvedValue([{ affectedRows: 1 }]);
    await queueAction(store, source, 5, "cancel");
    expect(query.mock.calls[0][0]).toContain("WHERE id=? AND state='queued'");
    expect(query.mock.calls[0][1]).toEqual([5]);
    expect(store.enqueue).not.toHaveBeenCalled();
  },
);
it("cannot cancel a job already claimed by a worker", async () => {
  const { store, query } = fixture();
  query.mockResolvedValue([{ affectedRows: 0 }]);
  await expect(queueAction(store, "book", 5, "cancel")).rejects.toThrow(
    "menunggu",
  );
});
it.each(["queued", "running", "completed", "cancelled"])(
  "cannot retry a %s job",
  async (state) => {
    const { store } = fixture({ state });
    await expect(queueAction(store, "book", 5, "retry")).rejects.toThrow(
      "gagal",
    );
    expect(store.enqueue).not.toHaveBeenCalled();
  },
);
it("rejects retrying a failed job from an older article revision", async () => {
  const { store } = fixture({
    state: "failed",
    revision: 1,
    current_revision: 2,
  });
  await expect(queueAction(store, "book", 5, "retry")).rejects.toThrow(
    "berubah",
  );
  expect(store.enqueue).not.toHaveBeenCalled();
});
it("retries only the failed stage within its content type", async () => {
  const { store } = fixture({
    state: "failed",
    chapter_id: 7,
    kind: "TTS_KALIMAT",
    content_type_id: 9,
    revision: 2,
    current_revision: 2,
    force_new: 0,
  });
  await queueAction(store, "book", 5, "retry");
  expect(store.enqueue).toHaveBeenCalledExactlyOnceWith(
    7,
    "TTS_KALIMAT",
    false,
  );
});
it("news media retry retains regeneration intent and uses production guards", async () => {
  const { store } = fixture({
    state: "failed",
    news_id: 7,
    kind: "PANEL",
    content_type_id: 9,
    revision: 2,
    current_revision: 2,
    force_new: 1,
  });
  const enqueue = vi
    .spyOn(NewsMediaStore.prototype, "enqueue")
    .mockRejectedValue(Error("Tunggu produksi selesai"));
  await expect(queueAction(store, "news-media", 5, "retry")).rejects.toThrow(
    "Tunggu produksi selesai",
  );
  expect(enqueue).toHaveBeenCalledExactlyOnceWith(7, "PANEL", true);
});
it("retries a failed news article via its article queue", async () => {
  const { store } = fixture({ id: 7, state: "failed", content_type_id: 9 });
  const retry = vi.spyOn(NewsStore.prototype, "retry").mockResolvedValue();
  await queueAction(store, "news-article", 7, "retry");
  expect(retry).toHaveBeenCalledExactlyOnceWith(7);
});
it("rejects unknown sources, actions, IDs, and filters before querying", async () => {
  const { store, query } = fixture();
  for (const [source, id, action] of [
    ["arbitrary", 1, "cancel"],
    ["book", 0, "retry"],
    ["book", 1, "drop"],
  ])
    await expect(queueAction(store, source, id, action)).rejects.toThrow();
  await expect(listQueue(store, "bad")).rejects.toThrow();
  expect(query).not.toHaveBeenCalled();
});
it("lists global production queues with a parameterized status filter", async () => {
  const { store, query } = fixture();
  query.mockResolvedValue([[{ id: 5, state: "running" }]]);
  expect(await listQueue(store, "running")).toEqual([
    { id: 5, state: "running" },
  ]);
  expect(query.mock.calls[0][0]).toContain("UNION ALL");
  expect(query.mock.calls[0][1]).toEqual(["running"]);
});

it("rejects retrying an old failure after a newer attempt exists", async () => {
  const { store } = fixture({
    state: "failed",
    revision: 2,
    current_revision: 2,
    latest_id: 8,
  });
  await expect(queueAction(store, "book", 5, "retry")).rejects.toThrow(
    "lebih baru",
  );
  expect(store.enqueue).not.toHaveBeenCalled();
});

it("opens the queue on the old schema without inventing job timestamps", async () => {
  const { store, query } = fixture();
  query
    .mockRejectedValueOnce(
      Object.assign(
        new Error("Unknown column 'j.created_at' in 'field list'"),
        { code: "ER_BAD_FIELD_ERROR" },
      ),
    )
    .mockResolvedValueOnce([[{ id: 5, created_at: null }]]);
  expect(await listQueue(store, "queued")).toEqual([
    { id: 5, created_at: null },
  ]);
  expect(query.mock.calls[1][0]).not.toContain("j.created_at");
  expect(query.mock.calls[1][0]).toContain("n.created_at");
  expect(query.mock.calls[1][1]).toEqual(["queued"]);
});
it("does not hide unrelated database errors", async () => {
  const { store, query } = fixture();
  query.mockRejectedValueOnce(
    Object.assign(new Error("Unknown column 'other'"), {
      code: "ER_BAD_FIELD_ERROR",
    }),
  );
  await expect(listQueue(store)).rejects.toThrow("other");
  expect(query).toHaveBeenCalledTimes(1);
});
