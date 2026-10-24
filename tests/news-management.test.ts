import { expect, it, vi } from "vitest";
import type mysql from "mysql2/promise";
import { NewsStore } from "../src/server/news-store";
import { newsFixture } from "./fixtures/news";
function setup({
  state = "completed",
  active = false,
  revision = 2,
  postStatus = "",
  zernioStatus = "",
} = {}) {
  const article = newsFixture().article;
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql: string) => {
      if (sql.includes("SELECT * FROM news_articles"))
        return [
          [{ id: 7, content_type_id: 2, article, attempts: revision, state }],
        ];
      if (sql.includes("SELECT id FROM news_media_jobs"))
        return [active ? [{ id: 9 }] : []];
      if (sql.includes("SELECT data FROM news_media_outputs"))
        return [
          postStatus ? [{ data: JSON.stringify({ status: postStatus }) }] : [],
        ];
      if (sql.includes("SELECT status FROM zernio_publications"))
        return [zernioStatus ? [{ status: zernioStatus }] : []];
      return [{ affectedRows: 1 }];
    }),
  };
  const db = {
    getConnection: vi.fn(async () => connection),
  } as unknown as mysql.Pool;
  return { store: new NewsStore(db), connection, article };
}
it("saving edited news advances revision so old media cannot be reused", async () => {
  const { store, connection, article } = setup();
  const next = article.replace(
    "Kabar teknologi baru",
    "Kabar teknologi diperbarui",
  );
  await store.save(7, next, 2);
  const update = connection.query.mock.calls.find(([sql]) =>
    sql.startsWith("UPDATE news_articles"),
  );
  expect(update?.[0]).toContain("attempts=attempts+1");
  expect(update?.[0]).toContain("artifacts=NULL");
  expect(connection.commit).toHaveBeenCalledOnce();
  expect(connection.rollback).not.toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalledOnce();
});
it("unchanged articles do not invalidate existing outputs", async () => {
  const { store, connection, article } = setup();
  await store.save(7, article, 2);
  expect(
    connection.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE")),
  ).toBe(false);
});
it("invalid edits never open a transaction", async () => {
  const { store, connection } = setup();
  await expect(store.save(7, "Isi tanpa struktur berita", 2)).rejects.toThrow();
  expect(connection.beginTransaction).not.toHaveBeenCalled();
});
it("stale editors and active production cannot overwrite news", async () => {
  for (const options of [
    { revision: 3 },
    { state: "running" },
    { active: true },
    { postStatus: "publishing" },
    { zernioStatus: "pending" },
  ]) {
    const { store, connection, article } = setup(options);
    await expect(
      store.save(7, article.replace("baru", "terbaru"), 2),
    ).rejects.toThrow();
    expect(
      connection.query.mock.calls.some(([sql]) => /^(UPDATE|DELETE)/.test(sql)),
    ).toBe(false);
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  }
});
it("deleting news is absolute: whatever its state, production or publication", async () => {
  for (const options of [
    { revision: 3 },
    { state: "running" },
    { state: "failed" },
    { active: true },
    { postStatus: "publishing" },
    { postStatus: "unknown" },
    { zernioStatus: "pending" },
  ]) {
    const { store, connection } = setup(options);
    await store.remove(7);
    expect(
      connection.query.mock.calls
        .map(([sql]) => sql)
        .filter((sql) => sql.startsWith("DELETE")),
    ).toEqual([
      "DELETE FROM news_stock WHERE news_id=?",
      "DELETE FROM news_media_outputs WHERE news_id=?",
      "DELETE FROM news_media_jobs WHERE news_id=?",
      "DELETE FROM news_articles WHERE id=?",
    ]);
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
  }
});
it("deleting news that does not exist is rejected without touching anything", async () => {
  const { store, connection } = setup();
  connection.query.mockImplementation(async () => [[]]);
  await expect(store.remove(7)).rejects.toThrow("tidak ditemukan");
  expect(connection.rollback).toHaveBeenCalledOnce();
});
it("deleting news removes owned records but preserves shared assets and publication history", async () => {
  const { store, connection } = setup();
  await store.remove(7);
  expect(
    connection.query.mock.calls
      .map(([sql]) => sql)
      .filter((sql) => sql.startsWith("DELETE")),
  ).toEqual([
    "DELETE FROM news_stock WHERE news_id=?",
    "DELETE FROM news_media_outputs WHERE news_id=?",
    "DELETE FROM news_media_jobs WHERE news_id=?",
    "DELETE FROM news_articles WHERE id=?",
  ]);
  expect(connection.commit).toHaveBeenCalledOnce();
});
