import { afterEach, beforeEach, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import {
  allPublished,
  isGone,
  manifestFiles,
  markGone,
  requiredPosts,
} from "../src/server/cleanup-domain";
import { cleanPublished } from "../src/server/cleanup";
import { normalizeBookSettings } from "../src/server/book-settings";
import { outputRoot } from "../src/server/output-paths";
import { ROOT } from "../src/server/config";
import type { Store } from "../src/server/store";

process.env.NCPOST_TEST = "true";
const settings = normalizeBookSettings({
  instagramAccountId: "1",
  tiktokAccountId: "a".repeat(24),
  youtubeAccountId: "b".repeat(24),
  socialTargets: ["instagram", "tiktok", "youtube"],
  instagramFormats: ["reels"],
  tiktok: { media: "v", privacy: "PUBLIC_TO_EVERYONE" },
});

it("sosmed yang dituju dibaca dari Rencana konten sosmed", () => {
  const outputs = ["VIDEO_KALIMAT", "PANEL"];
  expect(requiredPosts(outputs, settings)).toEqual({
    instagram: ["reels"],
    tiktok: true,
    youtube: true,
  });
  // tanpa akun TikTok atau privasi, sosmed itu tidak bisa diposting: tidak ditunggu
  const noAccount = normalizeBookSettings({
    ...settings,
    tiktokAccountId: null,
  });
  expect(requiredPosts(outputs, noAccount).tiktok).toBe(false);
  // Quote tidak memposting ke Instagram; output yang tidak ada tidak dituju
  expect(requiredPosts(["POST_IMAGE"], settings, "quote")).toEqual({
    instagram: [],
    tiktok: false,
    youtube: false,
  });
  expect(requiredPosts(outputs, null)).toEqual({
    instagram: [],
    tiktok: false,
    youtube: false,
  });
});

it("hapus hanya bila semua sosmed yang dituju sudah terbit", () => {
  const need = requiredPosts(["VIDEO_KALIMAT"], settings);
  const done = { carousel: false, reels: true, tiktok: true, youtube: true };
  expect(allPublished(need, done)).toBe(true);
  expect(allPublished(need, { ...done, youtube: false })).toBe(false);
  expect(allPublished(need, { ...done, reels: false })).toBe(false);
  // tidak ada sosmed yang dituju: tidak pernah dianggap selesai
  expect(
    allPublished(
      { instagram: [], tiktok: false, youtube: false },
      { carousel: true, reels: true, tiktok: true, youtube: true },
    ),
  ).toBe(false);
});

it("manifest: berkas yang dirujuk dan penanda dibersihkan", () => {
  expect(manifestFiles("VIDEO_KALIMAT", '{"file":"a.mp4"}')).toEqual(["a.mp4"]);
  expect(
    manifestFiles(
      "PANEL",
      '{"panels":[{"file":"p1.jpg"},{"file":"p2.jpg"}],"closing":"c.jpg"}',
    ),
  ).toEqual(["p1.jpg", "p2.jpg", "c.jpg"]);
  expect(manifestFiles("POST_IMAGE", "bukan json")).toEqual([]);
  const gone = markGone('{"file":"a.mp4","renderedAt":"x"}', new Date(0));
  expect(JSON.parse(gone)).toEqual({
    file: "a.mp4",
    renderedAt: "x",
    deleted: true,
    deletedAt: "1970-01-01T00:00:00.000Z",
  });
  expect(isGone(gone)).toBe(true);
  expect(isGone('{"file":"a.mp4"}')).toBe(false);
  expect(isGone(null)).toBe(false);
});

// ---------- pembersihan dengan database tiruan dan berkas sungguhan ----------
const dir = () => path.join(outputRoot(), "cleanup-test");
const rel = (name: string) => path.relative(ROOT, path.join(dir(), name));
const make = (name: string, bytes = 100) => {
  mkdirSync(path.dirname(path.join(dir(), name)), { recursive: true });
  writeFileSync(path.join(dir(), name), Buffer.alloc(bytes));
  return path.join(dir(), name);
};
beforeEach(() => rmSync(dir(), { recursive: true, force: true }));
afterEach(() => {
  rmSync(dir(), { recursive: true, force: true });
  rmSync(path.join(outputRoot(), "public", "uji-lama.mp4"), { force: true });
  rmSync(path.join(outputRoot(), "public", "uji-baru.mp4"), { force: true });
});

function fakeStore(chapters: any[], opts: { managed?: boolean } = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const type = {
    id: 1,
    name: "Buku",
    engine: "book",
    outputs: JSON.stringify(["VIDEO_KALIMAT"]),
    settings: JSON.stringify({
      ...settings,
      sentenceVideoKind: "IMAGE_VERTICAL",
      managed: !!opts.managed,
    }),
  };
  const bindings = [
    {
      kind: "S_IMAGE_LAB_7_V",
      panel: 1,
      asset_id: 5,
      file: rel("stok-siap.jpg"),
    },
    {
      kind: "S_IMAGE_LAB_8_V",
      panel: 1,
      asset_id: 6,
      file: rel("stok-ilustrasi.jpg"),
    },
  ];
  const db = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/FROM content_types/.test(sql)) return [[type]];
      if (/FROM zernio_publications/.test(sql))
        return [
          [{ source_key: "book:1:v", platform: "tiktok", status: "published" }],
        ];
      if (/FROM lab_prompts/.test(sql)) return [[{ id: 7 }]];
      if (/FROM chapters WHERE content_type_id/.test(sql)) return [chapters];
      if (/DISTINCT chapter_id/.test(sql)) return [[]];
      if (/FROM chapter_stock s JOIN assets/.test(sql)) return [bindings];
      if (/COUNT\(\*\)/.test(sql)) return [[{ n: 1 }]];
      return [{}];
    },
  };
  const store = { db, bookSettings: async () => settings } as unknown as Store;
  return { store, calls };
}
const chapter = (id: number, patch: Record<string, unknown> = {}) => ({
  id,
  book: "Buku",
  title: `Bab ${id}`,
  part_number: id,
  content_type_id: 1,
  post_status: "belum",
  reels_status: "published",
  sentence_video: JSON.stringify({
    file: rel(`video-${id}.mp4`),
    renderedAt: "x",
  }),
  sentence_video_h: null,
  panels: null,
  text_image: null,
  ...patch,
});

it("belum terbit di semua sosmed yang dituju: tidak dibersihkan", async () => {
  const video1 = make("video-1.mp4", 1000);
  const video3 = make("video-3.mp4", 4000);
  // 1 terbit di Instagram dan TikTok tetapi YouTube belum; 3 Reels belum terbit
  const { store, calls } = fakeStore([
    chapter(1),
    chapter(3, { reels_status: "belum" }),
  ]);
  const report = await cleanPublished(store, { act: true });
  expect(report).toEqual({ items: 0, files: 0, bytes: 0 });
  expect([video1, video3].every(existsSync)).toBe(true);
  expect(calls.some((c) => /^UPDATE chapters/.test(c.sql))).toBe(false);
});

it("hapus berkas, tandai hasilnya dihapus, dan hitung ukuran; perkiraan tidak menghapus", async () => {
  const solo = { ...settings, youtubeAccountId: null };
  const video = make("video-1.mp4", 1000);
  const publicOld = make("../public/uji-lama.mp4", 500);
  const publicNew = make("../public/uji-baru.mp4", 500);
  utimesSync(
    publicOld,
    new Date(Date.now() - 7200000),
    new Date(Date.now() - 7200000),
  );
  const { store, calls } = fakeStore([chapter(1)]);
  (store as any).bookSettings = async () => solo;
  // hanya Instagram dan TikTok yang dituju pada pengaturan ini
  const dry = await cleanPublished(store, { act: false });
  expect(dry).toEqual({ items: 1, files: 2, bytes: 1500 });
  expect([video, publicOld, publicNew].every(existsSync)).toBe(true);
  expect(calls.some((c) => /^(UPDATE|DELETE)/.test(c.sql))).toBe(false);

  const at = Date.now();
  const report = await cleanPublished(store, { act: true, now: at });
  expect(report).toEqual({ items: 1, files: 2, bytes: 1500 });
  expect(existsSync(video)).toBe(false);
  expect(existsSync(publicOld)).toBe(false);
  expect(existsSync(publicNew)).toBe(true);
  const update = calls.find((c) =>
    /^UPDATE chapters SET sentence_video=/.test(c.sql),
  )!;
  expect(JSON.parse(update.params[0] as string)).toMatchObject({
    deleted: true,
    deletedAt: new Date(at).toISOString(),
  });
  expect(update.params.slice(1)).toEqual([1, chapter(1).sentence_video]);
  expect(calls.some((c) => /^DELETE FROM media_stock/.test(c.sql))).toBe(true);
});

it("hasil yang sudah ditandai dihapus tidak diproses lagi", async () => {
  const solo = { ...settings, youtubeAccountId: null };
  const { store } = fakeStore([
    chapter(1, { sentence_video: markGone('{"file":"x.mp4"}') }),
  ]);
  (store as any).bookSettings = async () => solo;
  expect(await cleanPublished(store, { act: true })).toEqual({
    items: 0,
    files: 0,
    bytes: 0,
  });
});

it("gambar siap posting di stok dilepas, gambar ilustrasi tetap, dan hanya jenis terkelola", async () => {
  const solo = { ...settings, youtubeAccountId: null };
  const ready = make("stok-siap.jpg", 300);
  const art = make("stok-ilustrasi.jpg", 300);
  make("video-1.mp4", 100);
  const managed = fakeStore([chapter(1)], { managed: true });
  (managed.store as any).bookSettings = async () => solo;
  await cleanPublished(managed.store, { act: true });
  expect(existsSync(ready)).toBe(false);
  expect(existsSync(art)).toBe(true);
  expect(
    managed.calls.some((c) => /^DELETE s FROM chapter_stock/.test(c.sql)),
  ).toBe(true);
  expect(managed.calls.some((c) => /^DELETE FROM assets/.test(c.sql))).toBe(
    true,
  );

  // jenis tidak terkelola: stok gambar tidak disentuh (jadwal bisa membuatnya lagi)
  const ready2 = make("stok-siap.jpg", 300);
  make("video-1.mp4", 100);
  const plain = fakeStore([chapter(1)], { managed: false });
  (plain.store as any).bookSettings = async () => solo;
  await cleanPublished(plain.store, { act: true });
  expect(existsSync(ready2)).toBe(true);
  expect(
    plain.calls.some(
      (c) => /chapter_stock/.test(c.sql) && /^DELETE/.test(c.sql),
    ),
  ).toBe(false);
});

it("konten yang produksinya belum lengkap atau sedang diproses tidak dibersihkan", async () => {
  const solo = { ...settings, youtubeAccountId: null };
  const video = make("video-1.mp4", 100);
  const incomplete = fakeStore([
    chapter(1, { sentence_video: null, panels: JSON.stringify({ file: "x" }) }),
  ]);
  (incomplete.store as any).bookSettings = async () => solo;
  expect((await cleanPublished(incomplete.store, { act: true })).items).toBe(0);
  expect(existsSync(video)).toBe(true);
});

it("hapus konten menghapus berkas hasilnya, tetapi tidak pernah di luar folder output", async () => {
  const { removeResultFiles } = await import("../src/server/output-files");
  const video = make("video-9.mp4", 100);
  const panelA = make("panel/p1.jpg", 100);
  const closing = make("panel/c.jpg", 100);
  const outside = path.join(ROOT, "package.json");
  const queries: unknown[][] = [];
  const db = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push([sql, ...params]);
      return [{}];
    },
  };
  await removeResultFiles(db, [
    {
      kind: "VIDEO_KALIMAT",
      raw: JSON.stringify({ file: rel("video-9.mp4") }),
      locate: (f) => path.join(ROOT, f),
    },
    {
      kind: "PANEL",
      raw: JSON.stringify({
        panels: [{ file: "panel/p1.jpg" }],
        closing: "panel/c.jpg",
      }),
      locate: (f) => path.join(dir(), f),
    },
    // manifest rusak atau menunjuk ke luar output: diabaikan
    {
      kind: "POST_IMAGE",
      raw: JSON.stringify({ file: "package.json" }),
      locate: () => outside,
    },
    { kind: "POST_IMAGE", raw: "bukan json", locate: () => outside },
    { kind: "POST_IMAGE", raw: null, locate: () => outside },
  ]);
  expect([video, panelA, closing].some(existsSync)).toBe(false);
  expect(existsSync(outside)).toBe(true);
  expect(queries).toHaveLength(3);
  expect(queries[0]).toEqual([
    "DELETE FROM media_stock WHERE file=?",
    rel("video-9.mp4"),
  ]);
});
