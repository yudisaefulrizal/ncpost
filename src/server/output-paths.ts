// Lokasi hasil render per bagian, dengan nama yang bisa dibaca:
//   output/<buku>/<NN-judul-bagian>/
//     panel/        01-panel.jpg … 07-slide-penutup.jpg
//     audio/        kalimat_01.mp3 …
//     video-v.mp4   (9:16)      video-h.mp4   (16:9)
//     quote.jpg
// Kolam stok gambar (output/stock), salinan publik (output/public), cache dan
// folder kerja tetap di tempatnya dan namanya dicadangkan, jadi tidak bisa
// dipakai sebagai nama folder buku.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
} from "node:fs";
import path from "node:path";
import { ROOT } from "./config";
// Saat test, hasil ditulis ke output/.test agar folder asli tidak tersentuh.
export const outputRoot = () =>
  path.join(ROOT, "output", process.env.NCPOST_TEST === "true" ? ".test" : "");
const RESERVED = new Set([
  "berita",
  "lab",
  "lab-references",
  "stock",
  "public",
  "cache",
  "work",
  "probes",
  // folder lama (sebelum nama per buku)
  "panels",
  "audio",
  "audio-kalimat",
  "video",
  "video-kalimat",
  "video-kalimat-h",
  "quote-images",
]);
export interface ChapterRef {
  content_type_id?: number;
  id: number;
  book: string;
  title: string;
  part_number: number | null;
}
function slug(value: string, fallback: string, max: number) {
  return (
    value
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .replace(/-+$/, "") || fallback
  );
}
export function bookFolderName(book: string) {
  const name = slug(book, "buku", 60);
  return RESERVED.has(name) ? name + "-buku" : name;
}
export function chapterFolderName(c: ChapterRef) {
  const part = String(c.part_number ?? c.id).padStart(2, "0");
  return `${part}-${slug(c.title, "bagian", 60)}`;
}
export const chapterDir = (c: ChapterRef) =>
  path.join(
    outputRoot(),
    (c.content_type_id && c.content_type_id !== 1
      ? `jenis-${c.content_type_id}-`
      : "") + bookFolderName(c.book),
    chapterFolderName(c),
  );
export const panelDir = (c: ChapterRef) => path.join(chapterDir(c), "panel");
export const audioDir = (c: ChapterRef) => path.join(chapterDir(c), "audio");
export const quoteImagePath = (c: ChapterRef) =>
  path.join(chapterDir(c), "quote.jpg");
export const videoName = (horizontal: boolean) =>
  horizontal ? "video-h.mp4" : "video-v.mp4";
export const videoPath = (c: ChapterRef, horizontal: boolean) =>
  path.join(chapterDir(c), videoName(horizontal));
// Penghapusan/pemindahan hanya untuk folder bagian: tepat dua tingkat di
// bawah folder hasil dan bukan nama yang dicadangkan.
function assertChapterDir(dir: string) {
  const rel = path.relative(outputRoot(), dir).split(path.sep);
  if (
    rel.length !== 2 ||
    rel.some((x) => !x || x === "..") ||
    RESERVED.has(rel[0])
  )
    throw Error("Path hasil bagian tidak valid: " + dir);
}
function removeIfEmpty(dir: string) {
  try {
    if (existsSync(dir) && !readdirSync(dir).length) rmdirSync(dir);
  } catch {}
}
// Nomor bagian berubah → folder diganti nama. Panel dan video dibuang karena
// footer dan label slide pembukanya memuat nomor lama (kolom di database
// sudah dikosongkan oleh pemanggil). Dua tahap lewat nama sementara supaya
// pertukaran nomor tidak bentrok.
export function moveChapterOutputs(
  moves: { before: ChapterRef; after: ChapterRef }[],
) {
  const pending: { tmp: string; to: string }[] = [];
  for (const { before, after } of moves) {
    const from = chapterDir(before),
      to = chapterDir(after);
    if (from === to || !existsSync(from)) continue;
    assertChapterDir(from);
    assertChapterDir(to);
    const tmp = from + ".pindah";
    renameSync(from, tmp);
    pending.push({ tmp, to });
  }
  for (const { tmp, to } of pending) {
    if (existsSync(to)) throw Error("Folder tujuan sudah ada: " + to);
    mkdirSync(path.dirname(to), { recursive: true, mode: 0o700 });
    renameSync(tmp, to);
    rmSync(path.join(to, "panel"), { recursive: true, force: true });
    for (const h of [false, true])
      rmSync(path.join(to, videoName(h)), { force: true });
  }
  for (const { before } of moves)
    removeIfEmpty(path.dirname(chapterDir(before)));
}
// Bagian dihapus → seluruh hasil renderannya ikut dihapus (kolam stok gambar
// tidak disentuh).
export function removeChapterOutputs(c: ChapterRef) {
  const dir = chapterDir(c);
  assertChapterDir(dir);
  rmSync(dir, { recursive: true, force: true });
  removeIfEmpty(path.dirname(dir));
}
