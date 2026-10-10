import { expect, it, vi } from "vitest";
import { CONTENT_CRON_KEY } from "../src/server/cron";
import { Store, type Chapter } from "../src/server/store";
import { DEFAULT_BOOK_SETTINGS } from "../src/server/book-settings";

function fixture() {
  const scheduled = [
    {
      book_key: CONTENT_CRON_KEY,
      kind: "ARTICLE",
      enabled: 1,
      interval_hours: 2,
      batch_size: 1,
      last_item_id: 0,
      next_run: now,
      last_tick: null as number | null,
      last_result: null as string | null,
    },
  ];
  const chapters = [
    { id: 1, book: "Buku A", article: "draft", part_number: 1 },
    { id: 2, book: "Buku A", article: "", part_number: 2 },
    { id: 3, book: "Buku B", article: "", part_number: 1 },
  ] as Chapter[];
  const active: { chapter_id: number; kind: string; state: string }[] = [];
  const query = vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes("FROM content_types"))
      return [
        [
          {
            id: 1,
            name: "Buku",
            engine: "book",
            outputs: '["ARTICLE","QUOTE","IMAGES_PANEL"]',
            settings: null,
          },
        ],
      ];
    if (sql.includes("FROM book_cron WHERE enabled=1"))
      return [scheduled.filter((c) => c.enabled).map((c) => ({ ...c }))];
    if (sql.includes("FROM book_cron") && sql.includes("FOR UPDATE"))
      return [
        scheduled
          .filter((c) => c.book_key === params[0] && c.kind === params[1])
          .map((c) => ({ ...c })),
      ];
    if (sql.includes("FROM chapters")) return [chapters];
    if (sql.includes("FROM jobs"))
      return [active.filter((j) => j.chapter_id === params[0])];
    if (sql.includes("UPDATE book_cron")) {
      const c = scheduled.find(
        (c) =>
          c.book_key === params[sql.includes("last_item_id=?") ? 4 : 3] &&
          c.kind === params[sql.includes("last_item_id=?") ? 5 : 4],
      )!;
      c.last_tick = params[0];
      c.last_result = params[1];
      c.next_run = params[2];
      if (sql.includes("last_item_id=?")) c.last_item_id = params[3];
      return [{ affectedRows: 1 }];
    }
    throw Error(`Unexpected query: ${sql}`);
  });
  const connection = {
    query,
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
  const s = Object.create(Store.prototype) as Store;
  s.db = { query, getConnection: async () => connection } as any;
  vi.spyOn(s, "bookSettings").mockResolvedValue(DEFAULT_BOOK_SETTINGS);
  vi.spyOn(s, "stock").mockResolvedValue([]);
  const enqueue = vi
    .spyOn(s, "enqueue")
    .mockImplementation(async (id, kind) => {
      active.push({ chapter_id: id, kind, state: "queued" });
      return active.length;
    });
  return { s, scheduled, connection, enqueue };
}
const now = Date.parse("2026-10-07T02:00:00Z");
it("scheduler memilih topik siap lintas konteks dan tidak mengulang jadwal", async () => {
  const { s, scheduled, enqueue, connection } = fixture();
  await s.scheduleCrons(now);
  expect(enqueue).toHaveBeenCalledExactlyOnceWith(
    2,
    "ARTICLE",
    false,
    connection,
  );
  expect(scheduled[0].last_tick).toBe(now);
  expect(scheduled[0].last_result).toContain("1 topik");
  expect(scheduled[0].next_run).toBe(now + 2 * 3600000);
  await s.scheduleCrons(now + 40000);
  await s.scheduleCrons(now + 2 * 3600000 - 1);
  expect(enqueue).toHaveBeenCalledTimes(1);
  expect(connection.commit).toHaveBeenCalledTimes(1);
});
it("job yang masih aktif dilewati pada jadwal berikutnya dan jadwal tidak dirapel", async () => {
  const { s, scheduled, enqueue } = fixture();
  await s.scheduleCrons(now);
  await s.scheduleCrons(now + 86400000);
  expect(enqueue).toHaveBeenCalledTimes(2);
  expect(enqueue).toHaveBeenLastCalledWith(
    3,
    "ARTICLE",
    false,
    expect.anything(),
  );
  expect(scheduled[0].last_result).toContain("1 topik");
  await s.scheduleCrons(now + 86400000 + 60000);
  expect(enqueue).toHaveBeenCalledTimes(2);
});
it("kegagalan jadwal di-rollback dan dilaporkan", async () => {
  const { s, scheduled, enqueue, connection } = fixture();
  enqueue.mockRejectedValueOnce(Error("Provider belum siap"));
  await s.scheduleCrons(now);
  expect(connection.rollback).toHaveBeenCalledTimes(1);
  expect(scheduled[0].last_result).toContain("Gagal: Provider belum siap");
});
it("satu putaran memproses batch lintas konteks tanpa membuat pipeline", async () => {
  const { s, scheduled, enqueue } = fixture();
  scheduled[0].batch_size = 2;
  await s.scheduleCrons(now);
  expect(enqueue.mock.calls.map((c) => [c[0], c[1]])).toEqual([
    [2, "ARTICLE"],
    [3, "ARTICLE"],
  ]);
  expect(scheduled[0].last_item_id).toBe(3);
});
it("schema lama tetap bisa membaca pengaturan dan menunjukkan kebutuhan migrasi", async () => {
  const { s } = fixture();
  vi.spyOn(s, "list").mockResolvedValue([{ book: "Buku A" }] as Chapter[]);
  vi.mocked(s.db.query).mockRejectedValueOnce(
    Object.assign(Error("missing table"), { code: "ER_NO_SUCH_TABLE" }),
  );
  const crons = await s.bookCrons();
  expect(crons).toHaveLength(12);
  expect(crons.every((c) => !c.enabled)).toBe(true);
  expect(crons[0].last_result).toContain("npm run migrate");
});
it("simpan memvalidasi cron sebelum menulis serta menjelaskan migrasi yang belum dijalankan", async () => {
  const { s } = fixture();
  vi.spyOn(s, "list").mockResolvedValue([{ book: "Buku A" }] as Chapter[]);
  await expect(
    s.saveBookCron("Buku A", {
      kind: "ARTICLE",
      enabled: true,
      intervalHours: 0,
    }),
  ).rejects.toThrow("Interval");
  vi.mocked(s.db.query).mockRejectedValueOnce(
    Object.assign(Error("missing table"), { code: "ER_NO_SUCH_TABLE" }),
  );
  await expect(
    s.saveBookCron("Buku A", {
      kind: "ARTICLE",
      enabled: true,
      intervalHours: 2,
    }),
  ).rejects.toThrow("npm run migrate");
});

it("menyimpan interval memulai hitungan sejak disimpan dan nonaktif menghapus waktu berikutnya", async () => {
  const { s } = fixture();
  vi.spyOn(s, "list").mockResolvedValue([{ book: "Buku A" }] as Chapter[]);
  vi.mocked(s.db.query).mockResolvedValue([{ affectedRows: 1 }, []] as any);
  await s.saveBookCron(
    "Buku A",
    { kind: "QUOTE", enabled: true, intervalHours: 25 },
    now,
  );
  expect(s.db.query).toHaveBeenLastCalledWith(
    expect.stringContaining("INSERT INTO book_cron"),
    [CONTENT_CRON_KEY, "QUOTE", 1, 25, now + 25 * 3600000, 1, 1],
  );
  await s.saveBookCron(
    "Buku A",
    { kind: "QUOTE", enabled: false, intervalHours: 25 },
    now,
  );
  expect(s.db.query).toHaveBeenLastCalledWith(expect.any(String), [
    CONTENT_CRON_KEY,
    "QUOTE",
    0,
    25,
    null,
    1,
    1,
  ]);
});

it("cron nonaktif tidak mengantrekan topik", async () => {
  const { s, scheduled, enqueue, connection } = fixture();
  scheduled[0].enabled = 0;
  await s.scheduleCrons(now);
  expect(enqueue).not.toHaveBeenCalled();
  expect(connection.beginTransaction).not.toHaveBeenCalled();
});

it("pemilihan kembali ke topik awal setelah cursor mencapai akhir", async () => {
  const { s, scheduled, enqueue } = fixture();
  scheduled[0].last_item_id = 3;
  await s.scheduleCrons(now);
  expect(enqueue.mock.calls.map((call) => call[0])).toEqual([2]);
});
