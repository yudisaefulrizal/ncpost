import { NewsMediaStore } from "../src/server/news-media-store";
import { NewsCronStore } from "../src/server/news-cron";
import { beforeEach, afterEach, it, expect } from "vitest";
import dotenv from "dotenv";
import { Store } from "../src/server/store";
import { NewsStore } from "../src/server/news-store";
import { newsFixture } from "./fixtures/news";
process.env.NCPOST_TEST = "true";
dotenv.config({ quiet: true } as dotenv.DotenvConfigOptions);
let db: Store;
let s: NewsStore;
beforeEach(async () => {
  db = new Store();
  s = new NewsStore(db.db);
  await db.db.query("DELETE FROM news_stock");
  await db.db.query("DELETE FROM news_media_jobs");
  await db.db.query("DELETE FROM news_media_outputs");
  await db.db.query("DELETE FROM news_cron");
  await db.db.query("DELETE FROM news_content_settings");
  await db.db.query("DELETE FROM news_articles");
});
afterEach(() => db.close());
it("antrean berita terpisah; klaim paralel tidak mengambil artikel yang sama", async () => {
  const ids = [await s.create(), await s.create()];
  const claimed = await Promise.all([s.claim(100), s.claim(100)]);
  expect(claimed.map((j) => j!.id).sort()).toEqual(ids.sort());
  expect(await s.claim(101)).toBeUndefined();
});
it("hasil disimpan dengan kandidat, audit dan sumber tanpa mengubah data buku", async () => {
  const [before] = await db.db.query("SELECT COUNT(*) AS n FROM chapters");
  const id = await s.create();
  const j = (await s.claim(100))!;
  expect(await s.complete(j, newsFixture(), { test: true })).toBe(true);
  expect((await s.list()).find((n) => n.id === id)).toMatchObject({
    state: "completed",
    title: "Kabar teknologi baru",
  });
  const [after] = await db.db.query("SELECT COUNT(*) AS n FROM chapters");
  expect(after).toEqual(before);
  await expect(s.retry(id)).rejects.toThrow("gagal");
});
it("sumber duplikat ditolak dan kegagalan bisa dicoba ulang secara eksplisit", async () => {
  await s.create();
  const a = (await s.claim(100))!;
  await s.complete(a, newsFixture(), {});
  await s.create();
  const b = (await s.claim(100))!;
  await expect(s.complete(b, newsFixture(), {})).rejects.toThrow(
    "sudah pernah",
  );
  await s.fail(b, "Sumber duplikat");
  await s.retry(b.id);
  expect((await s.claim(200))!.attempts).toBe(2);
});
it("regenerate menjaga artikel lama tersedia dan mencegah dua job aktif", async () => {
  const id = await s.create();
  const old = (await s.claim(100))!;
  await expect(s.regenerate(id)).rejects.toThrow("selesai");
  await s.complete(old, newsFixture(), {});
  await s.regenerate(id);
  await expect(s.regenerate(id)).rejects.toThrow("selesai");
  expect((await s.list()).find((n) => n.id === id)).toMatchObject({
    state: "queued",
    article: newsFixture().article,
  });
  const next = (await s.claim(200))!;
  expect(next.attempts).toBe(2);
  expect(await s.complete(old, newsFixture(), {})).toBe(false);
  expect(await s.complete(next, newsFixture(), {})).toBe(true);
});
it("lease kedaluwarsa tidak mengulang otomatis dan hasil percobaan lama tidak dapat menimpa hasil baru", async () => {
  const id = await s.create();
  const old = (await s.claim(100))!;
  await s.claim(400000);
  expect((await s.list()).find((n) => n.id === id)?.state).toBe("failed");
  await s.retry(id);
  const next = (await s.claim(400001))!;
  expect(await s.complete(old, newsFixture(), {})).toBe(false);
  await s.fail(old, "stale");
  expect((await s.list()).find((n) => n.id === id)?.state).toBe("running");
  expect(await s.complete(next, newsFixture(), {})).toBe(true);
});

async function completedNews(suffix = "") {
  const id = await s.create(),
    j = (await s.claim(100))!;
  const result = newsFixture();
  if (suffix) {
    const old = result.candidate_topics[1].url,
      next = old + suffix;
    result.candidate_topics[1].url = next;
    result.article = result.article.replace(old, next);
    result.claim_source_map.forEach((c) => (c.source_url = next));
  }
  await s.complete(j, result, {});
  return id;
}
it("media berita memeriksa artikel, sumber panel, audio, dan sumber video sebelum antrean", async () => {
  const media = new NewsMediaStore(db.db),
    id = await s.create();
  await expect(media.enqueue(id, "IMAGE_VERTICAL")).rejects.toThrow("artikel");
  const j = (await s.claim(100))!;
  await s.complete(j, newsFixture(), {});
  await expect(media.enqueue(id, "PANEL")).rejects.toThrow("gambar");
  await expect(media.enqueue(id, "VIDEO_KALIMAT")).rejects.toThrow("audio");
  await expect(media.enqueue(id, "QUOTE")).rejects.toThrow("dikenal");
});
it("batch generate dan regenerate atomik; antrean aktif melarang artikel diubah", async () => {
  const id = await completedNews(),
    media = new NewsMediaStore(db.db);
  const ids = await media.enqueueMany(
    id,
    ["IMAGE_HORIZONTAL", "IMAGE_VERTICAL"],
    true,
  );
  expect(ids).toHaveLength(2);
  await expect(media.enqueue(id, "IMAGE_HORIZONTAL")).rejects.toThrow(
    "antrean",
  );
  await expect(s.regenerate(id)).rejects.toThrow("produksi");
  await expect(
    media.enqueueMany(id, ["S_IMAGE_VERTICAL", "INVALID"]),
  ).rejects.toThrow();
  expect((await media.detail(id, 1)).jobs).toHaveLength(2);
});
it("claim media paralel mengambil pemilik berbeda dan tidak menjalankan dua tahap satu artikel", async () => {
  const media = new NewsMediaStore(db.db),
    a = await completedNews("a"),
    b = await completedNews("b");
  await media.enqueueMany(a, ["IMAGE_VERTICAL", "IMAGE_HORIZONTAL"]);
  await media.enqueue(b, "TTS_KALIMAT");
  const jobs = await Promise.all([media.claim(100), media.claim(100)]);
  expect(jobs.map((j) => j?.news_id).sort()).toEqual([a, b].sort());
  expect(await media.claim(101)).toBeUndefined();
  await media.complete(jobs.find((j) => j?.news_id === a)!);
  expect((await media.claim(102))?.news_id).toBe(a);
});
it("stok berita memakai aset global; gambar yang telah terikat dilewati ketika jenis lain diaktifkan", async () => {
  const media = new NewsMediaStore(db.db),
    id = await completedNews();
  const asset = await db.addAsset(
    "IMAGE_VERTICAL",
    `output/.test/news-stock-${id}.jpg`,
    "Test news stock",
    "Test",
  );
  try {
    await media.enqueue(id, "IMAGE_VERTICAL");
    const j = (await media.claim(100))!;
    for (let i = 1; i <= 4; i++)
      expect(await media.bind(j, i, asset)).toBe(true);
    await media.complete(j);
    expect(
      (await db.assets("IMAGE_VERTICAL")).find((a) => a.id === asset)?.usage,
    ).toBe(4);
    expect(
      await media.enqueueMany(id, ["IMAGE_VERTICAL", "IMAGE_HORIZONTAL"]),
    ).toHaveLength(1);
    expect((await media.detail(id, 1)).stock).toHaveLength(4);
  } finally {
    await db.db.query("DELETE FROM news_stock WHERE asset_id=?", [asset]);
    await db.db.query("DELETE FROM assets WHERE id=?", [asset]);
  }
});
it("hasil job kedaluwarsa tidak menimpa job baru; invalidasi audio menghapus video tanpa menghapus stok", async () => {
  const id = await completedNews(),
    media = new NewsMediaStore(db.db);
  await media.enqueue(id, "TTS_KALIMAT");
  const old = (await media.claim(100))!;
  await media.claim(400000);
  expect(await media.output(old, { stale: true })).toBe(false);
  await media.enqueue(id, "TTS_KALIMAT");
  const next = (await media.claim(400001))!;
  await db.db.query(
    "INSERT INTO news_media_outputs(news_id,revision,kind,data) VALUES(?,1,'VIDEO_KALIMAT','{}')",
    [id],
  );
  await media.complete(next, { sentences: [] });
  expect((await media.detail(id, 1)).outputs.VIDEO_KALIMAT).toBeUndefined();
});
it("status publikasi unknown menghalangi kirim ulang dan regenerate artikel; poll lama tidak mengubah request baru", async () => {
  const id = await completedNews(),
    media = new NewsMediaStore(db.db),
    settings = await media.settings();
  for (const [kind, data] of [
    [
      "PANEL",
      {
        sources: {
          panelHorizontal: settings.panelHorizontal,
          panelVertical: settings.panelVertical,
        },
      },
    ],
    ["POST_IG", { requestId: "new-request", status: "unknown" }],
  ] as const)
    await db.db.query(
      "INSERT INTO news_media_outputs(news_id,revision,kind,data) VALUES(?,1,?,?)",
      [id, kind, JSON.stringify(data)],
    );
  await expect(media.enqueue(id, "POST_IG")).rejects.toThrow("sudah dikirim");
  await expect(s.regenerate(id)).rejects.toThrow("publikasi");
  await media.updatePublication(id, "POST_IG", "old-request", {
    status: "published",
  });
  expect((await media.detail(id, 1)).outputs.POST_IG).toMatchObject({
    requestId: "new-request",
    status: "unknown",
  });
});
it("cron berita default nonaktif, interval jam, tanpa quote dan tidak mengejar jadwal terlewat", async () => {
  const cron = new NewsCronStore(db.db);
  expect(await cron.list()).toHaveLength(9);
  expect((await cron.list()).every((c) => !c.enabled)).toBe(true);
  await expect(
    cron.save({ kind: "QUOTE", enabled: true, intervalHours: 1 }),
  ).rejects.toThrow("berita");
  await expect(
    cron.save({ kind: "ARTICLE", enabled: true, intervalHours: 0 }),
  ).rejects.toThrow("Interval");
  await cron.save({ kind: "ARTICLE", enabled: true, intervalHours: 2 }, 100);
  await cron.schedule(200);
  expect(await s.list()).toHaveLength(0);
  await Promise.all([cron.schedule(9000000), cron.schedule(9000000)]);
  expect(await s.list()).toHaveLength(1);
  expect((await cron.list()).find((c) => c.kind === "ARTICLE")?.next_run).toBe(
    16200000,
  );
});

it("jenis gambar yang tidak dipakai panel tidak membuang render panel", async () => {
  const id = await completedNews(),
    media = new NewsMediaStore(db.db);
  const data = {
    sources: {
      panelHorizontal: "IMAGE_HORIZONTAL",
      panelVertical: "IMAGE_VERTICAL",
    },
    panels: [],
  };
  await db.db.query(
    "INSERT INTO news_media_outputs(news_id,revision,kind,data) VALUES(?,1,'PANEL',?)",
    [id, JSON.stringify(data)],
  );
  await media.enqueue(id, "IMAGE_MINIMALIST");
  const j = (await media.claim(100))!;
  await media.complete(j);
  expect((await media.detail(id, 1)).outputs.PANEL).toEqual(data);
});

it("hasil publikasi revisi lama tidak ditandai sebagai publikasi artikel baru dan riwayat tetap tersimpan", async () => {
  const id = await completedNews(),
    media = new NewsMediaStore(db.db);
  await db.db.query(
    "INSERT INTO news_media_outputs(news_id,revision,kind,data) VALUES(?,1,'POST_IG',?)",
    [id, JSON.stringify({ status: "published", requestId: "published-old" })],
  );
  await s.regenerate(id);
  const next = (await s.claim(200))!;
  await s.complete(next, newsFixture(), {});
  expect((await media.detail(id, 2)).outputs.POST_IG).toBeUndefined();
  const [history]: any = await db.db.query(
    "SELECT data FROM news_media_outputs WHERE news_id=? AND revision=1",
    [id],
  );
  expect(JSON.parse(history[0].data).requestId).toBe("published-old");
});
