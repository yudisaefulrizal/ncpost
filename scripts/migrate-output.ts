// Migrasi satu kali: hasil render lama per id (output/panels/<id>, audio-kalimat,
// quote-images, video-kalimat, video-kalimat-h) → output/<buku>/<NN-judul>/.
// Aman diulang: hanya memindahkan yang masih ada di lokasi lama dan belum ada
// di tujuan. Jalankan saat tidak ada job yang berjalan:
//   npx tsx scripts/migrate-output.ts
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmdirSync,
} from "node:fs";
import path from "node:path";
import { initConfig, ROOT } from "../src/server/config";
import { Store } from "../src/server/store";
import {
  audioDir,
  chapterDir,
  panelDir,
  quoteImagePath,
  videoPath,
} from "../src/server/output-paths";
initConfig();
const store = new Store();
const old = (...parts: string[]) => path.join(ROOT, "output", ...parts);
function move(from: string, to: string, label: string) {
  if (!existsSync(from)) return 0;
  if (existsSync(to)) {
    console.log(`  lewati ${label}: tujuan sudah ada`);
    return 0;
  }
  mkdirSync(path.dirname(to), { recursive: true, mode: 0o700 });
  renameSync(from, to);
  console.log(`  ${label}`);
  return 1;
}
function removeIfEmpty(dir: string) {
  try {
    if (existsSync(dir) && !readdirSync(dir).length) rmdirSync(dir);
  } catch {}
}
let moved = 0;
for (const c of await store.list()) {
  console.log(`#${c.id} ${c.book} · ${c.title}`);
  const id = String(c.id);
  moved += move(old("panels", id), panelDir(c), "panel");
  moved += move(old("audio-kalimat", id), audioDir(c), "audio");
  moved += move(
    old("quote-images", id, "quote.jpg"),
    quoteImagePath(c),
    "quote.jpg",
  );
  for (const [dir, horizontal, column] of [
    ["video-kalimat", false, "sentence_video"],
    ["video-kalimat-h", true, "sentence_video_h"],
  ] as const) {
    const from = old(dir, id, "reels_video.mp4");
    const to = videoPath(c, horizontal);
    if (move(from, to, `video ${horizontal ? "h" : "v"}`)) {
      moved++;
      const manifest = JSON.parse((c as any)[column]);
      manifest.file = path.basename(to);
      await store.db.query(`UPDATE chapters SET ${column}=? WHERE id=?`, [
        JSON.stringify(manifest),
        c.id,
      ]);
    }
  }
  for (const dir of [
    "panels",
    "audio-kalimat",
    "quote-images",
    "video-kalimat",
    "video-kalimat-h",
  ])
    removeIfEmpty(old(dir, id));
}
for (const dir of [
  "panels",
  "audio-kalimat",
  "quote-images",
  "video-kalimat",
  "video-kalimat-h",
])
  removeIfEmpty(old(dir));
console.log(
  `Selesai: ${moved} berkas/folder dipindah ke ${path.join(ROOT, "output")}/<buku>/<NN-judul>/`,
);
await store.close();
