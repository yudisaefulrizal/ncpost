import { describe, expect, it } from "vitest";
import {
  accountStats,
  dailySeries,
  parseSummary,
  snapshotInstagram,
  type StatRow,
} from "../src/server/account-stats";

const row = (
  date: string,
  followers: number,
  likesMonth: number | null,
  viewsMonth: number | null,
  monthFrom = "2026-10-01T00:00:00.000Z",
): StatRow => ({
  date,
  username: "ncpost",
  followers,
  likesMonth,
  viewsMonth,
  monthFrom,
  unavailable: [],
  fetchedAt: 0,
});

describe("ringkasan NC-WA", () => {
  it("membaca follower, likes, dan views bulan berjalan", () => {
    expect(
      parseSummary({
        username: "ncpost",
        followers: 1200,
        month: {
          from: "2026-10-01T00:00:00.000Z",
          likes: 340,
          views: 9100,
          unavailable: [],
        },
      }),
    ).toEqual({
      username: "ncpost",
      followers: 1200,
      likes: 340,
      views: 9100,
      monthFrom: "2026-10-01T00:00:00.000Z",
      unavailable: [],
    });
  });
  it("metrik tanpa izin insights menjadi null; tanpa follower ditolak", () => {
    const s = parseSummary({
      followers: 5,
      month: { likes: null, views: null, unavailable: ["likes", "views"] },
    });
    expect(s.likes).toBeNull();
    expect(s.unavailable).toEqual(["likes", "views"]);
    expect(() => parseSummary({ month: {} })).toThrow();
  });
});

describe("perkembangan harian", () => {
  it("selisih dengan hari sebelumnya", () => {
    const s = dailySeries([
      row("2026-10-14", 1000, 300, 8000),
      row("2026-10-15", 1012, 340, 9100),
    ]);
    expect(s[0]).toMatchObject({
      followersDelta: null,
      likes: null,
      views: null,
    });
    expect(s[1]).toMatchObject({
      followersDelta: 12,
      likes: 40,
      views: 1100,
      span: 1,
    });
  });
  it("awal bulan: total bulan baru langsung menjadi angka hari itu", () => {
    const s = dailySeries([
      row("2026-10-31", 1000, 900, 20000, "2026-10-01T00:00:00.000Z"),
      row("2026-11-01", 1003, 25, 700, "2026-11-01T00:00:00.000Z"),
    ]);
    expect(s[1]).toMatchObject({ followersDelta: 3, likes: 25, views: 700 });
  });
  it("hari bolong ditandai sebagai gabungan beberapa hari", () => {
    const s = dailySeries([
      row("2026-10-10", 1000, 100, 1000),
      row("2026-10-13", 1009, 160, 1600),
    ]);
    expect(s[1]).toMatchObject({ span: 3, followersDelta: 9, likes: 60 });
  });
  it("total yang turun (revisi data) dianggap tidak diketahui", () => {
    const s = dailySeries([
      row("2026-10-14", 10, 300, 900),
      row("2026-10-15", 9, 290, 950),
    ]);
    expect(s[1]).toMatchObject({ followersDelta: -1, likes: null, views: 50 });
  });
});

describe("penyimpanan harian", () => {
  it("satu baris per akun per tanggal WIB, akun yang gagal dilaporkan", async () => {
    const queries: { sql: string; params?: any[] }[] = [];
    const db: any = {
      async query(sql: string, params?: any[]) {
        queries.push({ sql, params });
        return [[]];
      },
    };
    const now = Date.UTC(2026, 9, 15, 18, 0); // 16 Okt 01.00 WIB
    const r = await snapshotInstagram(
      db,
      {
        accounts: async () => ({
          state: "connected",
          accounts: [
            { id: "111", username: "satu" },
            { id: "222", username: "dua" },
          ],
        }),
        summary: async (id) => {
          if (id === "222") throw Error("NC-WA HTTP 403: izin insights");
          return {
            username: "satu",
            followers: 50,
            month: { likes: 3, views: 40 },
          };
        },
      },
      now,
    );
    expect(r).toEqual({
      saved: 1,
      errors: ["@dua: NC-WA HTTP 403: izin insights"],
    });
    const insert = queries.find((q) =>
      q.sql.includes("INSERT INTO account_stats"),
    )!;
    expect(insert.params!.slice(0, 6)).toEqual([
      "111",
      "2026-10-16",
      "satu",
      50,
      3,
      40,
    ]);
    expect(insert.sql).toContain("ON DUPLICATE KEY UPDATE");
  });
  it("NC-WA belum terhubung: tidak menyimpan apa pun", async () => {
    const db: any = { query: async () => [[]] };
    const r = await snapshotInstagram(db, {
      accounts: async () => ({
        state: "disconnected",
        reason: "NCWA_API_KEY belum diatur",
      }),
      summary: async () => ({}),
    });
    expect(r).toEqual({ saved: 0, errors: ["NCWA_API_KEY belum diatur"] });
  });
  it("halaman statistik: akun terhubung tampil walau belum ada data, TikTok/YouTube belum tersedia", async () => {
    const db: any = {
      async query(sql: string) {
        if (sql.startsWith("SELECT account_id"))
          return [
            [
              {
                account_id: "111",
                d: "2026-10-14",
                username: "satu",
                followers: 10,
                likes_month: 1,
                views_month: 5,
                month_from: "2026-10-01",
                unavailable: "[]",
                fetched_at: new Date(),
              },
              {
                account_id: "111",
                d: "2026-10-15",
                username: "satu",
                followers: 13,
                likes_month: 4,
                views_month: 9,
                month_from: "2026-10-01",
                unavailable: "[]",
                fetched_at: new Date(),
              },
            ],
          ];
        return [[]];
      },
    };
    const data = await accountStats(db, {
      accounts: async () => ({
        state: "connected",
        accounts: [
          { id: "111", username: "satu" },
          { id: "333", username: "baru" },
        ],
      }),
    });
    const [satu, baru] = data.instagram.accounts;
    expect(satu.latest).toMatchObject({
      followers: 13,
      followersDelta: 3,
      likes: 3,
      views: 4,
    });
    expect(baru).toMatchObject({
      username: "baru",
      connected: true,
      latest: null,
    });
    expect(data.tiktok.available).toBe(false);
    expect(data.youtube.available).toBe(false);
  });
});
