import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_BOOK_SETTINGS } from "../src/server/book-settings";
import { DEFAULT_TIKTOK_SETTINGS } from "../src/server/tiktok-settings";
import {
  emptyState as emptyManager,
  managerTick,
  type ManagerState,
} from "../src/server/manager";
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
  // Respons tambahan untuk query tertentu (mis. job gagal).
  const hooks: ((sql: string, params: any[]) => any)[] = [];
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
      for (const hook of hooks) {
        const result = hook(sql, params);
        if (result) return result;
      }
      if (sql.startsWith("SELECT * FROM content_types")) return [[type]];
      if (sql.includes("FROM jobs WHERE id IN"))
        return [
          params[0]
            .filter((id: number) => jobs.has(id))
            .map((id: number) => ({ id, ...jobs.get(id) })),
        ];
      if (sql.includes("FROM zernio_publications")) return [[]];
      if (sql.startsWith("UPDATE jobs SET state='cancelled'")) {
        const job = jobs.get(params[1]);
        if (job?.state !== "queued") return [{ affectedRows: 0 }];
        job.state = "cancelled";
        return [{ affectedRows: 1 }];
      }
      return [[]];
    },
  };
  const store: any = {
    db,
    list: async () => chapters,
    bookSettings: async () => settings,
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
  return { store, jobs, enqueued, targetFile, hooks };
}
const stateFile = () =>
  path.join(mkdtempSync(path.join(tmpdir(), "manajer-")), "manager.json");
const read = (file: string): ManagerState =>
  JSON.parse(readFileSync(file, "utf8"));
const writeState = (file: string, state: unknown) =>
  writeFileSync(file, JSON.stringify(state));

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

  it("gagal sebelum terkirim: topik yang sama tidak dipilih lagi hari itu", async () => {
    // Instagram: job gagal sebelum mengirim, post_status tetap "belum".
    const ig = [chapter(1), chapter(2)];
    const a = fakeStore(ig, { instagram: 2, tiktok: 0, youtube: 0 });
    const igFile = stateFile();
    const ok = async () => ({ status: "published" });
    await managerTick(a.store, ok, NIGHT, igFile, a.store.targetFile);
    a.jobs.set(100, { state: "failed", error: "NC-WA belum terhubung" });
    ig[0].production_jobs = [];
    await managerTick(
      a.store,
      ok,
      NIGHT + 16 * MIN,
      igFile,
      a.store.targetFile,
    );
    expect(a.enqueued.map((e) => e.id)).toEqual([1, 2]);

    // TikTok: publikasi ditolak sebelum terkirim.
    const b = fakeStore([chapter(1), chapter(2)], {
      instagram: 0,
      tiktok: 2,
      youtube: 0,
    });
    const published: string[] = [];
    const publish = async (source: string) => {
      published.push(source);
      if (source === "book:1") throw Error("Pilih akun YouTube/TikTok");
      return { status: "published" };
    };
    const ttFile = stateFile();
    await managerTick(b.store, publish, NIGHT, ttFile, b.store.targetFile);
    await managerTick(
      b.store,
      publish,
      NIGHT + 16 * MIN,
      ttFile,
      b.store.targetFile,
    );
    expect(published).toEqual(["book:1", "book:2"]);
    expect(read(ttFile).posts.map((p) => [p.chapterId, p.status])).toEqual([
      [1, "gagal"],
      [2, "terbit"],
    ]);
  });

  it("job posting yang tidak kunjung berjalan dibatalkan dan diganti", async () => {
    const chapters = [chapter(1), chapter(2)];
    const { store, jobs, enqueued } = fakeStore(chapters, {
      instagram: 1,
      tiktok: 0,
      youtube: 0,
    });
    const publish = async () => ({ status: "published" });
    const file = stateFile();
    await managerTick(store, publish, NIGHT, file, store.targetFile);
    await managerTick(store, publish, NIGHT + 20 * MIN, file, store.targetFile);
    expect(jobs.get(100)?.state).toBe("queued");
    expect(enqueued).toHaveLength(1);
    chapters[0].production_jobs = [];
    await managerTick(store, publish, NIGHT + 31 * MIN, file, store.targetFile);
    expect(jobs.get(100)?.state).toBe("cancelled");
    expect(enqueued.map((e) => e.id)).toEqual([1, 2]);
    expect(read(file).posts[0]).toMatchObject({ status: "gagal" });
  });

  it("stok TikTok dihitung dengan pengaturan per buku yang dipakai saat mengirim", async () => {
    const { store } = fakeStore([chapter(1), chapter(2)], {
      instagram: 0,
      tiktok: 1,
      youtube: 0,
    });
    store.bookSettings = async () => ({ ...settings, tiktokAccountId: null });
    const published: string[] = [];
    const file = stateFile();
    await managerTick(
      store,
      async (source: string) => (published.push(source), { status: "ok" }),
      NIGHT,
      file,
      store.targetFile,
    );
    expect(published).toEqual([]);
    expect(read(file).stock["1:tiktok"].ready).toBe(0);
  });

  it("kesalahan satu jenis konten tidak menghentikan putaran", async () => {
    const { store } = fakeStore([chapter(1)]);
    store.list = async () => {
      throw Error("DB putus");
    };
    const file = stateFile();
    await managerTick(
      store,
      async () => ({ status: "published" }),
      NIGHT,
      file,
      store.targetFile,
    );
    const state = read(file);
    expect(state.lastTickAt).toBe(NIGHT);
    expect(state.log[0].text).toContain("DB putus");
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

describe("Manajer menangani job gagal", () => {
  const none = { instagram: 0, tiktok: 0, youtube: 0 };
  // Job gagal terbaru per bagian dan jenis, beserta riwayat percobaannya.
  function withFailures(
    failed: {
      chapter: number;
      kind: string;
      fails: number;
      revision?: number;
    }[],
  ) {
    const fake = fakeStore([chapter(1), chapter(2), chapter(3)], none);
    const deleted: number[][] = [];
    fake.hooks.push((sql, params) => {
      if (sql.includes("j.state='failed'") && sql.includes("FROM jobs j"))
        return [
          failed.map((f, i) => ({
            id: 900 + i,
            chapter_id: f.chapter,
            kind: f.kind,
            revision: f.revision ?? 0,
            current_revision: 0,
            force_new: 0,
            content_type_id: 1,
            book: "Buku",
            part_number: f.chapter,
            title: `Topik ${f.chapter}`,
          })),
        ];
      if (sql.startsWith("SELECT id,state FROM jobs WHERE chapter_id=?")) {
        const f = failed.find(
          (x) => x.chapter === params[0] && x.kind === params[1],
        )!;
        return [
          [
            ...Array.from({ length: f.fails }, (_, i) => ({
              id: 800 - i,
              state: "failed",
            })),
            { id: 1, state: "completed" },
          ],
        ];
      }
      if (sql.startsWith("DELETE FROM jobs")) {
        deleted.push(params[0]);
        return [{ affectedRows: params[0].length }];
      }
    });
    return { ...fake, deleted };
  }
  const tick = (store: any, file: string, at: number) =>
    managerTick(
      store,
      async () => ({ status: "published" }),
      at,
      file,
      store.targetFile,
    );

  it("mencoba ulang job gagal sekali per 6 jam", async () => {
    const { store, enqueued, deleted } = withFailures([
      { chapter: 1, kind: "IMAGE_HORIZONTAL", fails: 1 },
      { chapter: 2, kind: "TTS_KALIMAT", fails: 4 },
    ]);
    const file = stateFile();
    await tick(store, file, NIGHT);
    expect(enqueued).toEqual([
      { id: 1, kind: "IMAGE_HORIZONTAL" },
      { id: 2, kind: "TTS_KALIMAT" },
    ]);
    expect(deleted).toEqual([]);
    await tick(store, file, NIGHT + 30 * MIN);
    expect(enqueued).toHaveLength(2);
    // 23.00 WIB → 00.30 WIB: blok 6 jam berikutnya.
    await tick(store, file, NIGHT + 90 * MIN);
    expect(enqueued).toHaveLength(4);
    expect(read(file).log.some((l) => l.text.includes("Mencoba ulang 2"))).toBe(
      true,
    );
  });

  it("gagal lebih dari 4 kali atau tidak bisa diulang: job dihapus", async () => {
    const { store, enqueued, deleted } = withFailures([
      { chapter: 1, kind: "IMAGE_HORIZONTAL", fails: 5 },
      { chapter: 2, kind: "PANEL", fails: 1, revision: -1 },
      { chapter: 3, kind: "VIDEO_KALIMAT", fails: 2 },
      { chapter: 3, kind: "TTS_KALIMAT", fails: 1 },
    ]);
    store.enqueue = async (id: number, kind: string) => {
      if (kind === "VIDEO_KALIMAT")
        throw Error("Video kalimat butuh audio per kalimat");
      if (kind === "TTS_KALIMAT") throw Error("Job aktif sudah ada");
      enqueued.push({ id, kind });
      return 1;
    };
    const file = stateFile();
    await tick(store, file, NIGHT);
    expect(enqueued).toEqual([]);
    expect(deleted).toEqual([[800, 799, 798, 797, 796], [800], [800, 799]]);
    expect(
      read(file).log.some((l) => l.text.startsWith("Menghapus 3 job gagal")),
    ).toBe(true);
  });
});

describe("Manajer menangani jenis konten berita", () => {
  const newsSettings = {
    ...settings,
    panelVertical: null,
    socialTargets: ["instagram", "tiktok"],
  };
  const ARTICLE =
    "# Judul\n\n## Judul\n\nIsi berita.\n\nSumber: Media, https://a.com/x\n\nTag: tekno";
  const article = (id: number, extra: any = {}) => ({
    id,
    content_type_id: 2,
    category: "teknologi",
    state: "completed",
    attempts: 1,
    lease: 0,
    title: `Berita ${id}`,
    article: ARTICLE,
    source_url: "https://a.com/x",
    candidates: null,
    artifacts: null,
    error: null,
    created_at: "",
    ...extra,
  });
  const panelReady = () => ({
    outputs: {
      PANEL: {
        mode: "template",
        sources: { panelHorizontal: "IMAGE_HORIZONTAL", panelVertical: null },
        panels: [{ file: "a" }, { file: "b" }],
        closing: "c",
      },
      VIDEO_KALIMAT: { file: "v.mp4", source: "IMAGE_VERTICAL" },
    },
    jobs: [] as any[],
    stock: [],
  });
  function newsWorld(
    articles: any[],
    production: Record<number, any>,
    targets = { instagram: 1, tiktok: 1, youtube: 0 },
  ) {
    const fake = fakeStore([], targets);
    const newsType = {
      id: 1,
      name: "Berita Tekno",
      engine: "news",
      outputs: JSON.stringify(["PANEL", "VIDEO_KALIMAT"]),
      settings: JSON.stringify(newsSettings),
      deleted_at: null,
    };
    const mediaJobs = new Map<number, string>();
    fake.hooks.push((sql, params) => {
      if (sql.startsWith("SELECT * FROM content_types")) return [[newsType]];
      if (sql.includes("FROM news_media_jobs WHERE id IN"))
        return [
          params[0].map((id: number) => ({
            id,
            state: mediaJobs.get(id) ?? "queued",
          })),
        ];
    });
    let nextId = 500;
    const calls = { created: 0, enqueued: [] as [number, string][] };
    const backend = {
      list: async () => [...articles].reverse(),
      detail: async (n: any) =>
        production[n.id] ?? { outputs: {}, jobs: [], stock: [] },
      create: async () => {
        calls.created++;
        const id = nextId++;
        articles.push(article(id, { state: "queued", title: "" }));
        return id;
      },
      enqueue: async (id: number, kind: string) => {
        calls.enqueued.push([id, kind]);
        const jobId = nextId++;
        (production[id] ??= { outputs: {}, jobs: [], stock: [] }).jobs.unshift({
          id: jobId,
          kind,
          state: "queued",
        });
        return jobId;
      },
      retry: async () => {},
    };
    return { ...fake, backend, calls, mediaJobs };
  }
  const run = (
    w: any,
    file: string,
    at: number,
    publish = async (_source: string) => ({ status: "published" }),
  ) => managerTick(w.store, publish, at, file, w.store.targetFile, w.backend);

  it("memposting berita siap ke Instagram lewat antrean berita dan TikTok dengan sumber news:", async () => {
    const w = newsWorld([article(7)], { 7: panelReady() });
    const sent: string[] = [];
    const file = stateFile();
    await run(w, file, NIGHT, async (source: string) => {
      sent.push(source);
      return { status: "published" };
    });
    expect(w.calls.enqueued).toContainEqual([7, "POST_IG"]);
    expect(sent).toEqual(["news:7"]);
    let state = read(file);
    const ig = state.posts.find((p) => p.platform === "instagram")!;
    expect(ig).toMatchObject({
      chapterId: 7,
      jobTable: "news_media_jobs",
      status: "proses",
    });
    // Status job posting dibaca dari news_media_jobs.
    w.mediaJobs.set(ig.jobId!, "completed");
    await run(w, file, NIGHT + MIN);
    state = read(file);
    expect(state.posts.find((p) => p.platform === "instagram")!.status).toBe(
      "terbit",
    );
  });

  it("stok kurang: Manajer menyuruh membuat artikel baru (Jurnalis) lalu mengawal tahap berikutnya", async () => {
    const articles: any[] = [];
    const production: Record<number, any> = {};
    const w = newsWorld(articles, production, {
      instagram: 1,
      tiktok: 0,
      youtube: 0,
    });
    const file = stateFile();
    await run(w, file, NIGHT);
    expect(w.calls.created).toBeGreaterThan(0);
    const state = read(file);
    expect(state.orders[0]).toMatchObject({ typeId: 1, status: "berjalan" });
    expect(state.log.some((l) => l.text.includes("artikel berita baru"))).toBe(
      true,
    );
    // Jurnalis selesai menulis: Manajer menyuruh tahap produksi berikutnya.
    for (const a of articles)
      Object.assign(a, {
        state: "completed",
        title: "Berita baru",
        article: ARTICLE,
      });
    await run(w, file, NIGHT + MIN);
    expect(w.calls.enqueued[0]).toEqual([articles[0].id, "IMAGE_HORIZONTAL"]);
    expect(read(file).orders[0].title).toBe("Berita baru");
  });

  it("stok berita siap dibatasi tiga walau target harian tinggi", async () => {
    const targets = { instagram: 10, tiktok: 0, youtube: 0 };
    // Siang hari: belum ada jam posting yang jatuh tempo, jadi stok utuh.
    const MORNING = Date.UTC(2026, 9, 15, 0) - WIB;
    const two = newsWorld(
      [article(1), article(2)],
      {
        1: panelReady(),
        2: panelReady(),
      },
      targets,
    );
    await run(two, stateFile(), MORNING);
    expect(two.calls.created).toBe(1);
    const three = newsWorld(
      [article(1), article(2), article(3)],
      {
        1: panelReady(),
        2: panelReady(),
        3: panelReady(),
      },
      targets,
    );
    const file = stateFile();
    await run(three, file, MORNING);
    expect(three.calls.created).toBe(0);
    expect(read(file).orders).toEqual([]);
  });

  it("artikel berita gagal ditulis: pesanan ditandai macet dengan pesan Jurnalis", async () => {
    const articles = [
      article(9, {
        state: "failed",
        error: "Jurnalis tidak menemukan berita baru",
      }),
    ];
    const w = newsWorld(articles, {}, { instagram: 1, tiktok: 0, youtube: 0 });
    const file = stateFile();
    const state0 = {
      ...emptyManager(),
      orders: [
        {
          at: NIGHT,
          updated: NIGHT,
          typeId: 1,
          chapterId: 9,
          title: "",
          reason: "x",
          status: "berjalan",
        },
      ],
    };
    writeState(file, state0);
    await run(w, file, NIGHT);
    const order = read(file).orders.find((o) => o.chapterId === 9)!;
    expect(order.status).toBe("macet");
    expect(order.note).toContain("Jurnalis tidak menemukan berita baru");
  });
});
