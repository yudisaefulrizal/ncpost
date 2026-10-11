import { expect, it, vi } from "vitest";
import { Store } from "../src/server/store";
import { CRON_TYPES, CONTENT_CRON_KEY } from "../src/server/cron";
import { DEFAULT_BOOK_SETTINGS } from "../src/server/book-settings";

function fixture({ claimed = true, previous = false, ready = true } = {}) {
  const cron = {
    book_key: CONTENT_CRON_KEY,
    kind: "POST_TIKTOK",
    content_type_id: 1,
    enabled: 1,
    interval_hours: 2,
    next_run: 100000,
    batch_size: 1,
  };
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM content_types"))
      return [
        [
          {
            id: 1,
            name: "Buku",
            engine: "book",
            outputs: '["VIDEO_KALIMAT"]',
            settings: JSON.stringify({
              managed: false,
              socialTargets: ["tiktok"],
            }),
          },
        ],
      ];
    if (sql.includes("FROM book_cron")) return [[cron]];
    if (sql.includes("SET last_tick"))
      return [{ affectedRows: claimed ? 1 : 0 }];
    if (sql.includes("FROM chapters"))
      return [
        [1, 2].map((id) => ({
          id,
          book: "Konteks",
          title: "Judul",
          article: "Paragraf pertama.",
          article_status: "siap",
          sentence_video: ready ? "video.mp4" : null,
        })),
      ];
    if (sql.includes("FROM jobs")) return [[]];
    if (sql.includes("FROM zernio_publications"))
      return [previous ? [{ id: 1 }] : []];
    if (sql.includes("SET last_result")) return [{ affectedRows: 1 }];
    throw Error(sql);
  });
  const store = Object.create(Store.prototype) as Store;
  store.db = {
    query,
    getConnection: vi.fn(() => {
      throw Error("Publikasi tidak boleh membuka transaksi");
    }),
  } as any;
  vi.spyOn(store, "bookSettings").mockResolvedValue({
    ...DEFAULT_BOOK_SETTINGS,
    socialTargets: ["tiktok"],
    tiktokAccountId: "akun",
    tiktok: { media: "v", privacy: "PUBLIC_TO_EVERYONE" },
  } as any);
  const enqueue = vi.spyOn(store, "enqueue");
  const publish = vi.fn(async () => ({ status: "pending" }));
  return { store, query, publish, enqueue };
}

it("menyediakan cron TikTok dan memublikasikan satu hasil siap tanpa produksi lain", async () => {
  expect(CRON_TYPES.some(([kind]) => kind === "POST_TIKTOK")).toBe(true);
  const f = fixture();
  await f.store.scheduleCrons(100000, f.publish);
  expect(f.publish).toHaveBeenCalledExactlyOnceWith("book:1");
  expect(f.enqueue).not.toHaveBeenCalled();
  expect(f.store.db.getConnection).not.toHaveBeenCalled();
});

it.each([{ previous: true }, { ready: false }, { claimed: false }])(
  "melewati publikasi lama, media belum siap, atau jadwal sudah diklaim: %j",
  async (options) => {
    const f = fixture(options);
    await f.store.scheduleCrons(100000, f.publish);
    expect(f.publish).not.toHaveBeenCalled();
    expect(f.enqueue).not.toHaveBeenCalled();
  },
);
