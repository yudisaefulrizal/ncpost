import { expect, it } from "vitest";
import { selectInstagramAccount } from "../src/server/instagram-account";
import {
  normalizeBookSettings,
  DEFAULT_BOOK_SETTINGS,
} from "../src/server/book-settings";
import { publish, publishCarousel } from "../src/server/providers";

const a = { id: "178414111", username: "buku_a" };
const b = { id: "178414222", username: "buku_b" };
const connection = { state: "connected", accounts: [a, b] };
it("pilihan per buku tidak mengikuti urutan akun dari NC-WA", () => {
  expect(selectInstagramAccount(b.id, connection)).toEqual(b);
  expect(
    selectInstagramAccount(a.id, { ...connection, accounts: [b, a] }),
  ).toEqual(a);
});
it("otomatis hanya saat satu akun, tanpa fallback jika akun pilihan hilang", () => {
  expect(
    selectInstagramAccount(null, { state: "connected", accounts: [a] }),
  ).toEqual(a);
  expect(() => selectInstagramAccount(null, connection)).toThrow(
    "beberapa akun",
  );
  expect(() =>
    selectInstagramAccount(b.id, { state: "connected", accounts: [a] }),
  ).toThrow("tidak tersedia");
  expect(() =>
    selectInstagramAccount(null, { state: "connected", accounts: [] }),
  ).toThrow("Belum ada akun");
  expect(() =>
    selectInstagramAccount(a.id, { state: "error", reason: "HTTP 401" }),
  ).toThrow("HTTP 401");
});
it("pengaturan buku lama tetap kompatibel dan ID akun divalidasi", () => {
  expect(
    normalizeBookSettings({
      ...DEFAULT_BOOK_SETTINGS,
      instagramAccountId: undefined,
    }).instagramAccountId,
  ).toBeNull();
  expect(
    normalizeBookSettings({
      ...DEFAULT_BOOK_SETTINGS,
      instagramAccountId: b.id,
    }).instagramAccountId,
  ).toBe(b.id);
  for (const id of [0, false, 123, "@nama", "abc", "1".repeat(65)])
    expect(() =>
      normalizeBookSettings({
        ...DEFAULT_BOOK_SETTINGS,
        instagramAccountId: id,
      }),
    ).toThrow("ID akun");
});
it("payload carousel dan Reels mengirim akun tujuan yang dipilih (HTTP mock)", async () => {
  const previous = process.env.NCWA_API_KEY;
  process.env.NCWA_API_KEY = "mock-ncwa-test";
  const sent: any[] = [];
  const request = (async (_url: any, init: any) => {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ status: "processing" }), {
      status: 202,
    });
  }) as typeof fetch;
  try {
    await publishCarousel(
      {
        requestId: "carousel-a",
        caption: "Contoh",
        igUserId: selectInstagramAccount(a.id, connection).id,
        imageUrls: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
      },
      request,
    );
    await publish(
      {
        requestId: "reels-b",
        igUserId: selectInstagramAccount(b.id, connection).id,
        videoUrl: "https://example.com/video.mp4",
      },
      request,
    );
    expect(sent.map((p) => [p.mediaType, p.igUserId])).toEqual([
      ["CAROUSEL", a.id],
      ["REELS", b.id],
    ]);
  } finally {
    if (previous === undefined) delete process.env.NCWA_API_KEY;
    else process.env.NCWA_API_KEY = previous;
  }
});
