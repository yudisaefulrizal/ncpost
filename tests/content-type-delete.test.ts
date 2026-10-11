import { expect, it, vi } from "vitest";
import { ContentTypeStore } from "../src/server/content-types";
function fixture(contents: unknown[] = [], types: unknown[] = [{ id: 3 }]) {
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT id FROM content_types")) return [types];
      if (sql.startsWith("SELECT id FROM chapters")) return [contents];
      return [{ affectedRows: 1 }];
    }),
  };
  return {
    connection,
    store: new ContentTypeStore({
      getConnection: async () => connection,
    } as any),
  };
}
it("removes an empty type and its schedules without deleting articles or shared assets", async () => {
  const { store, connection } = fixture();
  await store.remove(3);
  expect(connection.query).toHaveBeenCalledWith(
    "DELETE FROM book_cron WHERE content_type_id=?",
    [3],
  );
  expect(connection.query).toHaveBeenCalledWith(
    "DELETE FROM news_cron WHERE category=?",
    ["type-3"],
  );
  expect(connection.query).toHaveBeenCalledWith(
    "UPDATE content_types SET deleted_at=CURRENT_TIMESTAMP WHERE id=?",
    [3],
  );
  expect(connection.commit).toHaveBeenCalledOnce();
  expect(connection.rollback).not.toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalledOnce();
});
it("keeps a populated type and its schedules intact", async () => {
  const { store, connection } = fixture([{ id: 1 }]);
  await expect(store.remove(3)).rejects.toThrow(
    "masih memiliki topik atau artikel",
  );
  expect(
    connection.query.mock.calls.every(([sql]) => sql.startsWith("SELECT")),
  ).toBe(true);
  expect(connection.commit).not.toHaveBeenCalled();
  expect(connection.rollback).toHaveBeenCalledOnce();
  expect(connection.release).toHaveBeenCalledOnce();
});
it("rejects missing or previously deleted types", async () => {
  const { store, connection } = fixture([], []);
  await expect(store.remove(3)).rejects.toThrow("tidak ditemukan");
  expect(connection.query).toHaveBeenCalledTimes(1);
  expect(connection.rollback).toHaveBeenCalledOnce();
});
