import { afterEach, expect, it, vi } from "vitest";
import { scheduleProduction } from "../src/server/auto-production";
import { ContentTypeStore } from "../src/server/content-types";
import { normalizeContentType } from "../src/server/content-type-domain";
import type { Store } from "../src/server/store";
afterEach(() => vi.restoreAllMocks());
function setup({ enabled = true, lock = 1, active = false } = {}) {
  const type = {
    id: 87,
    ...normalizeContentType({
      name: "Otomatis",
      engine: "book",
      outputs: ["POST_IMAGE"],
    }),
  };
  type.settings.managed = true;
  type.settings.autoProcess = enabled;
  vi.spyOn(ContentTypeStore.prototype, "list").mockResolvedValue([type]);
  const chapters = [1, 2, 3].map((id) => ({
    id,
    revision: 1,
    content_type_id: type.id,
    article: "",
    book: `Buku ${id}`,
    title: "Bagian",
  }));
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql: string, args?: number[]) => {
      if (sql.includes("GET_LOCK")) return [[{ acquired: lock }]];
      if (sql.includes("FROM chapters"))
        return [[chapters.find((c) => c.id === args?.[0])]];
      if (sql.includes("FROM jobs"))
        return [active ? [{ kind: "ARTICLE", state: "queued" }] : []];
      return [[]];
    }),
  };
  const store = {
    db: { getConnection: vi.fn(async () => connection) },
    list: vi.fn(async () => chapters),
    enqueue: vi.fn(),
  };
  return { connection, store };
}
it("queues every eligible book part under its type and honors the batch limit", async () => {
  const { store, connection } = setup();
  await scheduleProduction(store as unknown as Store, 2);
  expect(store.enqueue.mock.calls).toEqual([
    [1, "ARTICLE", false, connection],
    [2, "ARTICLE", false, connection],
  ]);
  expect(connection.commit).toHaveBeenCalledTimes(2);
  expect(connection.release).toHaveBeenCalledOnce();
});
it("paused types do not queue anything", async () => {
  const { store } = setup({ enabled: false });
  await scheduleProduction(store as unknown as Store);
  expect(store.list).not.toHaveBeenCalled();
  expect(store.enqueue).not.toHaveBeenCalled();
});
it("another scheduler or an existing active job does not create duplicates", async () => {
  const first = setup({ lock: 0 });
  await scheduleProduction(first.store as unknown as Store);
  expect(first.store.list).not.toHaveBeenCalled();
  expect(first.connection.release).toHaveBeenCalledOnce();
  const second = setup({ active: true });
  await scheduleProduction(second.store as unknown as Store);
  expect(second.store.enqueue).not.toHaveBeenCalled();
});
it("enqueue errors roll back the part and leave other parts processable", async () => {
  const { store, connection } = setup();
  vi.spyOn(console, "error").mockImplementation(() => {});
  store.enqueue.mockRejectedValueOnce(new Error("temporary"));
  await scheduleProduction(store as unknown as Store);
  expect(connection.rollback).toHaveBeenCalledOnce();
  expect(connection.commit).toHaveBeenCalledTimes(2);
  expect(store.enqueue).toHaveBeenCalledTimes(3);
  expect(connection.release).toHaveBeenCalledOnce();
});
