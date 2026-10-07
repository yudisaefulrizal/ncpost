import { it, expect, beforeEach, afterEach } from "vitest";
import dotenv from "dotenv";
import { Store } from "../src/server/store";
// Database MySQL khusus test (ncpost_test), dikosongkan tiap kasus.
process.env.NCPOST_TEST = "true";
dotenv.config({ quiet: true } as dotenv.DotenvConfigOptions);
let s: Store;
beforeEach(async () => {
  s = new Store();
  for (const t of ["chapter_stock", "jobs", "assets", "chapters"])
    await s.db.query(`DELETE FROM ${t}`);
});
afterEach(() => s.close());
it("bab diinput: judul wajib, status awal belum, hapus membersihkan job", async () => {
  await expect(s.create(" ", "Bab")).rejects.toThrow(/wajib/);
  const c = await s.create(" Buku  Satu ", " Bab ");
  expect(await s.chapter(c)).toMatchObject({
    book: "Buku Satu",
    title: "Bab",
    article: "",
    article_status: "belum",
    visual_status: "belum",
    revision: 0,
  });
  await s.save(c, "draft");
  expect((await s.chapter(c))?.article_status).toBe("draft");
  const j = await s.enqueue(c, "EDITOR");
  await s.claim();
  await s.remove(c);
  expect(await s.list()).toHaveLength(0);
  expect(await s.jobs()).toHaveLength(0);
  expect(await s.complete(j, { report: "{}" })).toBe(false);
  await expect(s.remove(c)).rejects.toThrow(/tidak ditemukan/);
});
it("job duplikat, klaim atomik, recovery lease, attempts terbatas", async () => {
  const c = await s.create("B", "C");
  const id = await s.enqueue(c, "ARTICLE");
  await expect(s.enqueue(c, "ARTICLE")).rejects.toThrow(/aktif/);
  expect(await s.claim(100)).toMatchObject({
    id,
    state: "running",
    attempts: 1,
  });
  expect(await s.claim(101)).toBeUndefined();
  await s.recover(100 + 400000);
  expect(await s.claim(500000)).toMatchObject({ id, attempts: 2 });
  await s.recover(900000);
  expect((await s.jobs())[0].state).toBe("failed");
});
it("save invalidates pending preview and worker stale revision cannot commit", async () => {
  const c = await s.create("B", "C");
  await s.save(
    c,
    "# Judul\n\n## Heading Hook\nHook.\n\nSatu.\n\nDua.\n\nTiga.\n\nEmpat.\n\nLima.\n\nBerdasarkan buku Buku, Penulis.\n\nTag: buku",
  );
  const j = await s.enqueue(c, "PREVIEW");
  await s.claim();
  await s.save(c, "new");
  expect((await s.jobs())[0].state).toBe("cancelled");
  expect(await s.complete(j, { preview: "old" })).toBe(false);
  expect((await s.chapter(c))?.preview).toBeNull();
});
it("regenerasi meningkatkan revision dan hasil editor/preview lama tidak dapat menandai artikel baru siap", async () => {
  const c = await s.create("B", "C");
  await s.save(c, "draft lama");
  const edit = await s.enqueue(c, "EDITOR");
  await s.claim();
  const regen = await s.enqueue(c, "ARTICLE", true);
  expect(await s.claim()).toBeUndefined();
  await s.complete(edit, { report: JSON.stringify({ lolos: true }) });
  await s.claim();
  const revision = (await s.chapter(c))!.revision;
  await s.complete(regen, { article: "draf baru" });
  expect((await s.chapter(c))!.revision).toBe(revision + 1);
  expect((await s.chapter(c))!.article_status).toBe("menunggu editor");
});
it("hasil worker dengan snapshot invalid langsung dibatalkan", async () => {
  const c = await s.create("B", "C");
  const id = await s.enqueue(c, "ARTICLE");
  await s.claim();
  await s.db.query("UPDATE chapters SET revision=revision+1 WHERE id=?", [c]);
  expect(await s.complete(id, { article: "stale" })).toBe(false);
  expect((await s.jobs())[0].state).toBe("cancelled");
});
it("round-robin keeps chapter/book identity", async () => {
  const a1 = await s.create("A", "A1");
  await s.create("A", "A2");
  await s.create("B", "B1");
  expect((await s.nextChapter())?.id).toBe(a1);
});
it("stok gambar membutuhkan editor dan heartbeat mempertahankan lease", async () => {
  const c = await s.create("B", "C");
  await expect(s.enqueue(c, "IMAGE_HORIZONTAL")).rejects.toThrow(/editorial/);
  const j = await s.enqueue(c, "ARTICLE");
  await s.claim(100);
  await s.heartbeat(j, 300000);
  await s.recover(400000);
  expect((await s.jobs())[0].state).toBe("running");
});
it("aset kolam bertahan; ikatan bab hilang saat artikel disimpan ulang atau bab dihapus", async () => {
  const c = await s.create("B", "C");
  await s.db.query("UPDATE chapters SET article_status='siap' WHERE id=?", [c]);
  const j = await s.enqueue(c, "IMAGE_VERTICAL");
  await s.claim();
  const a = await s.addAsset(
    "IMAGE_VERTICAL",
    "output/stock/IMAGE_VERTICAL/x.png",
    "celengan kaca",
    "p",
  );
  expect(await s.bind(j, 1, a)).toBe(true);
  expect(await s.stock(c)).toMatchObject([
    { panel: 1, asset_id: a, description: "celengan kaca" },
  ]);
  expect((await s.assets("IMAGE_VERTICAL"))[0].usage).toBe(1);
  expect(await s.assets("IMAGE_HORIZONTAL")).toHaveLength(0);
  await s.save(c, "baru");
  expect(await s.bind(j, 2, a)).toBe(false);
  expect(await s.stock(c)).toHaveLength(0);
  expect(await s.assets("IMAGE_VERTICAL")).toMatchObject([{ id: a, usage: 0 }]);
  await s.remove(c);
  expect(await s.assets("IMAGE_VERTICAL")).toHaveLength(1);
});
it("job artikel otomatis menyimpan artikel final + laporan editor sekaligus", async () => {
  const c = await s.create("B", "C");
  const j = await s.enqueue(c, "ARTICLE");
  await s.claim();
  const report = { lolos: true, checks: [], revisions: [{ round: 1 }] };
  expect(
    await s.complete(j, { article: "final", report: JSON.stringify(report) }),
  ).toBe(true);
  expect(await s.chapter(c)).toMatchObject({
    article: "final",
    article_status: "siap",
    revision: 1,
  });
  expect(JSON.parse((await s.chapter(c))!.report!).revisions).toHaveLength(1);
  const j2 = await s.enqueue(c, "ARTICLE", true);
  await s.claim();
  await s.complete(j2, {
    article: "masih kurang",
    report: JSON.stringify({ lolos: false, checks: [] }),
  });
  expect((await s.chapter(c))?.article_status).toBe("revisi");
});
it("regenerate stok melepas ikatan lajur itu dan memaksa gambar baru", async () => {
  const c = await s.create("B", "C");
  await s.db.query("UPDATE chapters SET article_status='siap' WHERE id=?", [c]);
  const j = await s.enqueue(c, "IMAGE_VERTICAL");
  await s.claim();
  const a = await s.addAsset("IMAGE_VERTICAL", "x.png", "x", "p");
  await s.bind(j, 1, a);
  await s.complete(j, { visual: "tersedia: IMAGE_VERTICAL" });
  expect((await s.claim()) ?? null).toBeNull();
  const r = await s.enqueue(c, "IMAGE_VERTICAL", true);
  expect((await s.jobs()).find((x) => x.id === r)?.force_new).toBe(1);
  expect(await s.stock(c, "IMAGE_VERTICAL")).toHaveLength(0);
  expect(await s.assets("IMAGE_VERTICAL")).toHaveLength(1);
});
it("nomor bagian: berurutan per buku, bisa diedit dengan tukar nomor, panel dan video terdampak dibuang", async () => {
  const a = await s.create("Buku", "Satu");
  const b = await s.create("buku", "Dua");
  const c = await s.create("Buku", "Tiga");
  const other = await s.create("Lain", "X");
  expect((await s.list()).map((x) => [x.id, x.part_number])).toEqual([
    [a, 1],
    [b, 2],
    [c, 3],
    [other, 1],
  ]);
  await s.db.query(
    "UPDATE chapters SET panel_status='tersedia',panels='{}',sentence_video='{}',sentence_video_h='{}' WHERE id IN (?,?,?)",
    [a, c, other],
  );
  // Bagian 1 diganti jadi 3: bertukar dengan bagian yang tadi bernomor 3.
  expect(await s.setPartNumber(a, 3)).toEqual({ id: a, part: 3, swapped: c });
  const rows = await s.list();
  expect(rows.map((x) => [x.id, x.part_number])).toEqual([
    [a, 3],
    [b, 2],
    [c, 1],
    [other, 1],
  ]);
  for (const id of [a, c])
    expect(rows.find((x) => x.id === id)).toMatchObject({
      panel_status: "belum",
      panels: null,
      sentence_video: null,
      sentence_video_h: null,
    });
  // Buku lain tidak terpengaruh. Nomor kosong dipakai tanpa tukar.
  expect(rows.find((x) => x.id === other)?.panel_status).toBe("tersedia");
  expect(await s.setPartNumber(b, 7)).toEqual({
    id: b,
    part: 7,
    swapped: null,
  });
  expect(await s.setPartNumber(b, 7)).toEqual({
    id: b,
    part: 7,
    swapped: null,
  });
  await expect(s.setPartNumber(b, 0)).rejects.toThrow(/1–9999/);
  await expect(s.setPartNumber(b, 1.5)).rejects.toThrow(/1–9999/);
  await expect(s.setPartNumber(9999, 1)).rejects.toThrow(/tidak ditemukan/);
  // Bagian baru mendapat nomor setelah yang terbesar.
  expect((await s.chapter(await s.create("Buku", "Empat")))?.part_number).toBe(
    8,
  );
});
it("nomor bagian tidak diubah saat ada job aktif; hapus bagian tidak menggeser nomor lain", async () => {
  const a = await s.create("Buku", "Satu");
  const b = await s.create("Buku", "Dua");
  await s.db.query("UPDATE chapters SET article_status='siap' WHERE id=?", [a]);
  await s.enqueue(a, "QUOTE").catch(() => {});
  await s.db.query(
    "INSERT INTO jobs(chapter_id,kind,state,revision) VALUES(?,?,?,0)",
    [b, "QUOTE", "queued"],
  );
  await expect(s.setPartNumber(a, 2)).rejects.toThrow(/job aktif/);
  await s.db.query("DELETE FROM jobs");
  await s.db.query(
    "UPDATE chapters SET panel_status='tersedia',panels='{}' WHERE id=?",
    [b],
  );
  await s.remove(a);
  const left = await s.chapter(b);
  expect(left?.part_number).toBe(2);
  expect(left?.panel_status).toBe("tersedia");
});
it("Post IG hanya untuk panel siap dan tidak bisa dobel saat diproses/terbit/belum pasti", async () => {
  const c = await s.create("B", "C");
  await expect(s.enqueue(c, "POST_IG")).rejects.toThrow(/panel/);
  await s.db.query("UPDATE chapters SET panel_status='tersedia' WHERE id=?", [
    c,
  ]);
  for (const [status, err] of [
    ["processing", /diproses/],
    ["published", /sudah diposting/],
    ["unknown", /belum pasti/],
  ] as const) {
    await s.setPost(c, { status, requestId: "r1" });
    await expect(s.enqueue(c, "POST_IG")).rejects.toThrow(err);
  }
  await s.setPost(c, { status: "failed", requestId: "r1" });
  expect(await s.enqueue(c, "POST_IG")).toBeGreaterThan(0);
  await s.setPost(c, { status: "processing", requestId: "r2" });
  expect((await s.pendingPosts()).map((x) => x.id)).toEqual([c]);
});
it("quote butuh artikel valid, tersimpan, dan hilang saat artikel berubah", async () => {
  const c = await s.create("B", "C");
  await expect(s.enqueue(c, "QUOTE")).rejects.toThrow(/artikel final/);
  await s.save(
    c,
    "# Judul\n\n## Heading Hook\nHook.\n\nSatu.\n\nDua.\n\nTiga.\n\nEmpat.\n\nLima.\n\nBerdasarkan buku Buku, Penulis.\n\nTag: buku",
  );
  const j = await s.enqueue(c, "QUOTE");
  await s.claim();
  expect(await s.complete(j, { quote: "Kalimat satu. Kalimat dua." })).toBe(
    true,
  );
  expect((await s.chapter(c))?.quote).toBe("Kalimat satu. Kalimat dua.");
  await s.save(c, "artikel baru");
  expect((await s.chapter(c))?.quote).toBeNull();
});
it("klaim paralel: tiga lajur gambar satu bagian jalan bersamaan, panel menunggu", async () => {
  const c = await s.create("B", "C");
  await s.db.query("UPDATE chapters SET article_status='siap' WHERE id=?", [c]);
  for (const k of ["IMAGE_HORIZONTAL", "IMAGE_VERTICAL", "IMAGE_MINIMALIST"])
    await s.enqueue(c, k);
  const claimed = [await s.claim(), await s.claim(), await s.claim()];
  expect(claimed.map((j) => j?.kind)).toEqual([
    "IMAGE_HORIZONTAL",
    "IMAGE_VERTICAL",
    "IMAGE_MINIMALIST",
  ]);
  expect(await s.claim()).toBeUndefined();
});
it("stok paper cut tidak membatalkan panel", async () => {
  const c = await s.create("B", "C");
  await s.db.query(
    "UPDATE chapters SET article_status='siap',panel_status='tersedia',panels='{}' WHERE id=?",
    [c],
  );
  const j = await s.enqueue(c, "IMAGE_PAPERCUT");
  await s.claim();
  await s.complete(j, { visual: "tersedia: IMAGE_PAPERCUT" });
  expect((await s.chapter(c))?.panel_status).toBe("tersedia");
  await s.enqueue(c, "IMAGE_PAPERCUT", true);
  expect((await s.chapter(c))?.panel_status).toBe("tersedia");
});
it("pengaturan konten per buku: bawaan, simpan, panel mengikuti sumber", async () => {
  await s.db.query("DELETE FROM book_settings");
  const c = await s.create("Buku  Satu", "C");
  expect(await s.bookSettings("buku satu")).toEqual(
    (await import("../src/server/book-settings")).DEFAULT_BOOK_SETTINGS,
  );
  await s.saveBookSettings("BUKU SATU", {
    stockKinds: [],
    panelHorizontal: null,
    panelVertical: "IMAGE_PAPERCUT",
    videoKind: "IMAGE_PAPERCUT",
  });
  expect((await s.bookSettings("Buku Satu")).stockKinds).toEqual([
    "IMAGE_PAPERCUT",
  ]);
  await s.db.query(
    "UPDATE chapters SET article_status='siap',panel_status='tersedia',panels='{}' WHERE id=?",
    [c],
  );
  await expect(s.enqueue(c, "PANEL")).rejects.toThrow(/IMAGE_PAPERCUT/);
  // Stok horizontal bukan sumber panel buku ini → panel tidak dibatalkan.
  const h = await s.enqueue(c, "IMAGE_HORIZONTAL");
  await s.claim();
  await s.complete(h, { visual: "tersedia: IMAGE_HORIZONTAL" });
  expect((await s.chapter(c))?.panel_status).toBe("tersedia");
  // Stok paper cut adalah sumber panel → panel dibatalkan.
  const p = await s.enqueue(c, "IMAGE_PAPERCUT");
  await s.claim();
  await s.complete(p, { visual: "tersedia: IMAGE_PAPERCUT" });
  expect((await s.chapter(c))?.panel_status).toBe("belum");
  expect((await s.list()).find((x) => x.id === c)?.stock_counts).toEqual({});
  await s.db.query("DELETE FROM book_settings");
});
it("gambar quote butuh quote dan ter-reset saat quote dibuat ulang", async () => {
  const c = await s.create("B", "C");
  await expect(s.enqueue(c, "QUOTE_IMAGE")).rejects.toThrow(/butuh quote/);
  await s.db.query("UPDATE chapters SET quote='Q.' WHERE id=?", [c]);
  const j = await s.enqueue(c, "QUOTE_IMAGE");
  await s.claim();
  await s.complete(j, { quoteImage: '{"file":"quote.jpg"}' });
  expect((await s.chapter(c))?.quote_image).toContain("quote.jpg");
  await s.db.query(
    "UPDATE chapters SET article=?,article_status='siap' WHERE id=?",
    [
      "# Judul\n\n## Heading Hook\nHook.\n\nSatu.\n\nDua.\n\nTiga.\n\nEmpat.\n\nLima.\n\nBerdasarkan buku Buku, Penulis.\n\nTag: buku",
      c,
    ],
  );
  const q = await s.enqueue(c, "QUOTE");
  // Gambar quote yang antre setelah quote harus menunggu quote selesai.
  const qi = await s.enqueue(c, "QUOTE_IMAGE");
  expect((await s.claim())?.id).toBe(q);
  expect(await s.claim()).toBeUndefined();
  await s.complete(q, { quote: "Quote baru." });
  expect((await s.chapter(c))?.quote_image).toBeNull();
  expect((await s.claim())?.id).toBe(qi);
});
it("reels IG: butuh video, status terpisah dari carousel, tidak dobel posting", async () => {
  const c = await s.create("B", "C");
  await expect(s.enqueue(c, "REELS_IG")).rejects.toThrow(/Video/);
  await s.db.query("UPDATE chapters SET sentence_video='{}' WHERE id=?", [c]);
  await s.setReels(c, { status: "processing", requestId: "r1" });
  await expect(s.enqueue(c, "REELS_IG")).rejects.toThrow(/diproses/);
  expect((await s.pendingReels()).map((x) => x.id)).toEqual([c]);
  expect((await s.chapter(c))?.post_status).toBe("belum");
  await s.setReels(c, { status: "failed", requestId: "r1" });
  const j = await s.enqueue(c, "REELS_IG");
  expect(j).toBeGreaterThan(0);
  await s.setReels(c, { status: "published", requestId: "r2", mediaId: "m" });
  await s.db.query("UPDATE jobs SET state='completed' WHERE id=?", [j]);
  await expect(s.enqueue(c, "REELS_IG")).rejects.toThrow(/sudah diposting/);
});
it("gambar per kalimat: butuh artikel lolos, ikatan per nomor kalimat terpisah dari panel", async () => {
  const c = await s.create("B", "C");
  await expect(s.enqueue(c, "S_IMAGE_VERTICAL")).rejects.toThrow(/editorial/);
  await s.db.query("UPDATE chapters SET article_status='siap' WHERE id=?", [c]);
  const j = await s.enqueue(c, "S_IMAGE_VERTICAL");
  const a = await s.addAsset(
    "IMAGE_VERTICAL",
    "output/stock/x/k.jpg",
    "Kalimat.",
    "p",
  );
  expect((await s.claim())?.id).toBe(j);
  expect(await s.bind(j, 7, a)).toBe(true);
  await s.complete(j, {});
  expect((await s.list()).find((x) => x.id === c)?.stock_counts).toEqual({
    S_IMAGE_VERTICAL: 1,
  });
  expect(await s.stock(c, "IMAGE_VERTICAL")).toEqual([]);
});
it("audio & video kalimat: syarat, tersimpan, video hilang saat audio dibuat ulang", async () => {
  const c = await s.create("Buku K", "C");
  await expect(s.enqueue(c, "TTS_KALIMAT")).rejects.toThrow(/lolos editor/);
  await s.db.query(
    "UPDATE chapters SET article_status='siap',article=? WHERE id=?",
    [
      "# J\n\n## H\n\nNol.\n\nSatu. Dua.\n\nTiga.\n\nEmpat.\n\nLima.\n\nEnam.\n\nBerdasarkan buku B.\n\nTag: buku",
      c,
    ],
  );
  await expect(s.enqueue(c, "VIDEO_KALIMAT")).rejects.toThrow(
    /Pengaturan Konten/,
  );
  await s.saveBookSettings("Buku K", {
    panelVertical: "IMAGE_VERTICAL",
    sentenceVideoKind: "IMAGE_VERTICAL",
  });
  await expect(s.enqueue(c, "VIDEO_KALIMAT")).rejects.toThrow(/setiap kalimat/);
  const j = await s.enqueue(c, "S_IMAGE_VERTICAL");
  await s.claim();
  const a = await s.addAsset(
    "IMAGE_VERTICAL",
    "output/stock/k/x.jpg",
    "x",
    "p",
  );
  for (let i = 1; i <= 7; i++) await s.bind(j, i, a);
  await s.complete(j, {});
  await expect(s.enqueue(c, "VIDEO_KALIMAT")).rejects.toThrow(
    /audio per kalimat/,
  );
  const t = await s.enqueue(c, "TTS_KALIMAT");
  await s.claim();
  await s.complete(t, { sentenceAudio: "{}" });
  const v = await s.enqueue(c, "VIDEO_KALIMAT");
  await s.claim();
  await s.complete(v, { sentenceVideo: '{"file":"reels_video.mp4"}' });
  expect((await s.chapter(c))?.sentence_video).toBe(
    '{"file":"reels_video.mp4"}',
  );
  const t2 = await s.enqueue(c, "TTS_KALIMAT");
  await s.claim();
  await s.complete(t2, { sentenceAudio: "{}" });
  expect((await s.chapter(c))?.sentence_video).toBeNull();
  await s.save(c, "baru");
  expect(await s.chapter(c)).toMatchObject({
    sentence_audio: null,
    sentence_video: null,
  });
});
it("video kalimat H: butuh sumber horizontal; hilang saat audio kalimat dibuat ulang", async () => {
  const c = await s.create("Buku H", "C");
  await s.db.query(
    "UPDATE chapters SET article_status='siap',article=? WHERE id=?",
    [
      "# J\n\n## H\n\nNol.\n\nSatu.\n\nDua.\n\nTiga.\n\nEmpat.\n\nLima.\n\nBerdasarkan buku B.\n\nTag: buku",
      c,
    ],
  );
  await expect(s.enqueue(c, "VIDEO_KALIMAT_H")).rejects.toThrow(
    /Video Kalimat H/,
  );
  await s.saveBookSettings("Buku H", {
    panelVertical: "IMAGE_VERTICAL",
    sentenceVideoHKind: "IMAGE_HORIZONTAL",
  });
  const j = await s.enqueue(c, "S_IMAGE_HORIZONTAL");
  await s.claim();
  const a = await s.addAsset(
    "IMAGE_HORIZONTAL",
    "output/stock/h/x.jpg",
    "x",
    "p",
  );
  for (let i = 1; i <= 6; i++) await s.bind(j, i, a);
  await s.complete(j, {});
  const t = await s.enqueue(c, "TTS_KALIMAT");
  await s.claim();
  await s.complete(t, { sentenceAudio: "{}" });
  const v = await s.enqueue(c, "VIDEO_KALIMAT_H");
  await s.claim();
  await s.complete(v, { sentenceVideoH: '{"file":"reels_video.mp4"}' });
  expect((await s.chapter(c))?.sentence_video_h).toBe(
    '{"file":"reels_video.mp4"}',
  );
  const t2 = await s.enqueue(c, "TTS_KALIMAT");
  await s.claim();
  await s.complete(t2, { sentenceAudio: "{}" });
  expect((await s.chapter(c))?.sentence_video_h).toBeNull();
});
