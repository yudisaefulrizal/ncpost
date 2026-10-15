import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_BOOK_SETTINGS } from "../src/server/book-settings";
import { DEFAULT_TIKTOK_SETTINGS } from "../src/server/tiktok-settings";
import { managerTick, type ManagerState } from "../src/server/manager";
import { saveTargets } from "../src/server/manager-targets";

const WIB = 7 * 3600000;
// 15 Okt 2026 23.00 WIB: semua jam posting hari itu sudah jatuh tempo.
const NIGHT = Date.UTC(2026, 9, 15, 23) - WIB;
const MIN = 60000;

const settings = {
  ...DEFAULT_BOOK_SETTINGS,
  managed: false,
  stockKinds: ["IMAGE_HORIZONTAL"],
  sentenceKinds: ["IMAGE_VERTICAL"],
  sentenceVideoKind: "IMAGE_VERTICAL",
  panelHorizontal: "IMAGE_HORIZONTAL",
  socialTargets: ["instagram", "tiktok"],
  instagramFormats: ["carousel"],
  tiktokAccountId: "a".repeat(24),
  tiktok: { ...DEFAULT_TIKTOK_SETTINGS, media: "v" },
};
const chapter = (id: number, extra: any = {}) => ({
  id,
  book: "Buku",
  title: `Topik ${id}`,
  part_number: id,
  content_type_id: 1,
  content_engine: "book",
  article: "Artikel " + id,
  article_status: "siap",
  panels: JSON.stringify({
    panels: [{ file: "a" }, { file: "b" }],
    closing: "c",
  }),
  panel_status: "tersedia",
  post_status: "belum",
  sentence_video: `video-${id}.mp4`,
  sentence_video_h: null,
  reels_status: "belum",
  production_jobs: [] as any[],
  ...extra,
});

function fakeStore(
  chapters: any[],
  targets: Record<string, number> = { instagram: 2, tiktok: 1, youtube: 0 },
) {
  const jobs = new Map<number, { state: string; error?: string }>();
  const enqueued: { id: number; kind: string }[] = [];
  let nextId = 100;
  const type = {
    id: 1,
    name: "Buku Motivasi",
    engine: "book",
    outputs: JSON.stringify(["PANEL", "VIDEO_KALIMAT"]),
    settings: JSON.stringify(settings),
    deleted_at: null,
  };
  const db = {
    async getConnection() {
      return {
        query: async (sql: string) =>
          sql.includes("GET_LOCK") ? [[{ acquired: 1 }]] : [[]],
        release() {},
      };
    },
    async query(sql: string, params: any[] = []) {
      if (sql.startsWith("SELECT * FROM content_types")) return [[type]];
      if (sql.includes("FROM jobs WHERE id IN"))
        return [
          params[0]
            .filter((id: number) => jobs.has(id))
            .map((id: number) => ({ id, ...jobs.get(id) })),
        ];
      if (sql.includes("FROM zernio_publications")) return [[]];
      return [[]];
    },
  };
  const store: any = {
    db,
    list: async () => chapters,
    enqueue: async (id: number, kind: string) => {
      const jobId = nextId++;
      enqueued.push({ id, kind });
      jobs.set(jobId, { state: "queued" });
      chapters
        .find((c) => c.id === id)
        ?.production_jobs.push({ kind, state: "queued", error: null });
      return jobId;
    },
  };
  const dir = mkdtempSync(path.join(tmpdir(), "manajer-"));
  const targetFile = path.join(dir, "targets.json");
  saveTargets({ 1: targets }, targetFile);
  store.targetFile = targetFile;
  return { store, jobs, enqueued, targetFile };
}
const stateFile = () =>
  path.join(mkdtempSync(path.join(tmpdir(), "manajer-")), "manager.json");
const read = (file: string): ManagerState =>
  JSON.parse(readFileSync(file, "utf8"));

describe("Manajer bekerja", () => {
  it("memposting konten siap saat jatuh tempo, menjaga jarak, dan mencatat hasilnya", async () => {
    const chapters = [chapter(1), chapter(2), chapter(3)];
    const { store, jobs, enqueued } = fakeStore(chapters);
    const published: string[] = [];
    const publish = async (source: string) => {
      published.push(source);
      return { status: "published" };
    };
    const file = stateFile();

    await managerTick(store, publish, NIGHT, file, store.targetFile);
    expect(enqueued).toEqual([{ id: 1, kind: "POST_IG" }]);
    // Chapter 1 sedang punya job posting, jadi TikTok mengambil topik siap berikutnya.
    expect(published).toEqual(["book:2"]);
    let state = read(file);
    expect(state.posts.map((p) => [p.platform, p.status])).toEqual([
      ["instagram", "proses"],
      ["tiktok", "terbit"],
    ]);

    // Jarak minimum: posting Instagram kedua belum dilakukan semenit kemudian.
    await managerTick(store, publish, NIGHT + MIN, file, store.targetFile);
    expect(enqueued).toHaveLength(1);

    // Job pertama selesai; 16 menit kemudian Manajer memposting yang kedua.
    jobs.set(100, { state: "completed" });
    chapters[0].production_jobs = [];
    chapters[0].post_status = "published";
    await managerTick(store, publish, NIGHT + 16 * MIN, file, store.targetFile);
    state = read(file);
    expect(state.posts.find((p) => p.jobId === 100)?.status).toBe("terbit");
    expect(enqueued[1]).toEqual({ id: 2, kind: "POST_IG" });
    // Target TikTok (1) sudah tercapai, jadi tidak memposting lagi.
    expect(published).toEqual(["book:2"]);
  });

  it("posting gagal dicatat dan dicoba lagi dengan konten lain", async () => {
    const chapters = [chapter(1), chapter(2)];
    const { store, jobs, enqueued } = fakeStore(chapters, {
      instagram: 2,
      tiktok: 0,
      youtube: 0,
    });
    const file = stateFile();
    await managerTick(
      store,
      async () => ({ status: "published" }),
      NIGHT,
      file,
      store.targetFile,
    );
    jobs.set(100, { state: "failed", error: "NC-WA menolak" });
    chapters[0].production_jobs = [];
    chapters[0].post_status = "failed";
    await managerTick(
      store,
      async () => ({ status: "published" }),
      NIGHT + 16 * MIN,
      file,
      store.targetFile,
    );
    const state = read(file);
    expect(state.posts[0].status).toBe("gagal");
    expect(state.posts[0].note).toBe("NC-WA menolak");
    expect(enqueued.map((e) => e.id)).toEqual([1, 2]);
    expect(state.log.some((l) => l.text.includes("gagal"))).toBe(true);
  });

  it("stok kurang: menyuruh tim memproduksi topik berikutnya", async () => {
    const chapters = [
      chapter(1),
      chapter(2, {
        article: "",
        article_status: "belum",
        panels: null,
        panel_status: "belum",
        sentence_video: null,
      }),
      chapter(3, {
        article: "",
        article_status: "belum",
        panels: null,
        panel_status: "belum",
        sentence_video: null,
      }),
    ];
    const { store, enqueued } = fakeStore(chapters, {
      instagram: 3,
      tiktok: 0,
      youtube: 0,
    });
    const file = stateFile();
    await managerTick(
      store,
      async () => ({ status: "published" }),
      NIGHT,
      file,
      store.targetFile,
    );
    const state = read(file);
    // Satu konten siap diposting, dua topik diperintahkan untuk diproduksi.
    expect(enqueued).toContainEqual({ id: 1, kind: "POST_IG" });
    expect(enqueued).toContainEqual({ id: 2, kind: "ARTICLE" });
    expect(enqueued).toContainEqual({ id: 3, kind: "ARTICLE" });
    expect(state.orders.map((o) => [o.chapterId, o.status])).toEqual([
      [2, "berjalan"],
      [3, "berjalan"],
    ]);
  });

  it("target hari ini tertutup, stok besok belum ada: tim disuruh menyiapkan", async () => {
    const chapters = [
      chapter(1),
      chapter(2, {
        article: "",
        article_status: "belum",
        panels: null,
        panel_status: "belum",
        sentence_video: null,
      }),
    ];
    const { store, enqueued } = fakeStore(chapters, {
      instagram: 1,
      tiktok: 0,
      youtube: 0,
    });
    const file = stateFile();
    await managerTick(
      store,
      async () => ({ status: "published" }),
      NIGHT,
      file,
      store.targetFile,
    );
    expect(enqueued).toContainEqual({ id: 1, kind: "POST_IG" });
    expect(enqueued).toContainEqual({ id: 2, kind: "ARTICLE" });
    const state = read(file);
    expect(state.orders[0].reason).toBe("Persiapan stok Instagram");
  });

  it("topik habis: Manajer melapor, tidak memaksa", async () => {
    const { store, enqueued } = fakeStore([], {
      instagram: 1,
      tiktok: 0,
      youtube: 0,
    });
    const file = stateFile();
    await managerTick(
      store,
      async () => ({ status: "published" }),
      NIGHT,
      file,
      store.targetFile,
    );
    expect(enqueued).toEqual([]);
    expect(
      read(file).log.some((l) => l.text.includes("Tambahkan topik baru")),
    ).toBe(true);
  });

  it("sebelum jam posting pertama belum ada yang diposting", async () => {
    const { store, enqueued } = fakeStore([chapter(1), chapter(2), chapter(3)]);
    const file = stateFile();
    let called = false;
    const morning = Date.UTC(2026, 9, 15, 5) - WIB; // 05.00 WIB
    await managerTick(
      store,
      async () => ((called = true), { status: "published" }),
      morning,
      file,
      store.targetFile,
    );
    expect(enqueued).toEqual([]);
    expect(called).toBe(false);
  });

  it("tanpa target, Manajer tidak melakukan apa pun", async () => {
    const { store, enqueued } = fakeStore([chapter(1)], {
      instagram: 0,
      tiktok: 0,
      youtube: 0,
    });
    const file = stateFile();
    let called = false;
    await managerTick(
      store,
      async () => ((called = true), { status: "x" }),
      NIGHT,
      file,
      store.targetFile,
    );
    expect(enqueued).toEqual([]);
    expect(called).toBe(false);
  });
});
