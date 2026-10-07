import { it, expect, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
process.env.NCPOST_TEST = "true";
import {
  bookFolderName,
  chapterFolderName,
  chapterDir,
  panelDir,
  audioDir,
  quoteImagePath,
  videoPath,
  moveChapterOutputs,
  removeChapterOutputs,
  outputRoot,
} from "../src/server/output-paths";
afterEach(() => rmSync(outputRoot(), { recursive: true, force: true }));
const ref = (id: number, book: string, title: string, part: number | null) => ({
  id,
  book,
  title,
  part_number: part,
});
function touch(file: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, "x");
}
it("nama folder: buku dan bagian terbaca, nomor 2 digit, nama yang dicadangkan dihindari", () => {
  expect(bookFolderName("How to Win Friends and Influence People")).toBe(
    "how-to-win-friends-and-influence-people",
  );
  expect(bookFolderName("Stock")).toBe("stock-buku");
  expect(bookFolderName("Public")).toBe("public-buku");
  expect(bookFolderName("???")).toBe("buku");
  expect(chapterFolderName(ref(9, "B", "Ganti Kritik dengan Empati!", 2))).toBe(
    "02-ganti-kritik-dengan-empati",
  );
  expect(chapterFolderName(ref(9, "B", "x".repeat(200), 12)).length).toBe(
    3 + 60,
  );
  expect(chapterFolderName(ref(9, "B", "...", 105))).toBe("105-bagian");
  const c = ref(1, "Buku Satu", "Judul", 3);
  const dir = chapterDir(c);
  expect(path.relative(outputRoot(), dir)).toBe("buku-satu/03-judul");
  expect(path.relative(dir, panelDir(c))).toBe("panel");
  expect(path.relative(dir, audioDir(c))).toBe("audio");
  expect(path.relative(dir, quoteImagePath(c))).toBe("quote.jpg");
  expect(path.relative(dir, videoPath(c, false))).toBe("video-v.mp4");
  expect(path.relative(dir, videoPath(c, true))).toBe("video-h.mp4");
});
it("ganti nomor: folder diganti nama, audio dan quote ikut, panel dan video dibuang", () => {
  const before = ref(1, "Buku", "Judul", 1);
  const after = { ...before, part_number: 4 };
  touch(path.join(audioDir(before), "kalimat_01.mp3"));
  touch(path.join(panelDir(before), "01-panel.jpg"));
  touch(quoteImagePath(before));
  touch(videoPath(before, false));
  touch(videoPath(before, true));
  moveChapterOutputs([{ before, after }]);
  expect(existsSync(chapterDir(before))).toBe(false);
  expect(existsSync(path.join(audioDir(after), "kalimat_01.mp3"))).toBe(true);
  expect(existsSync(quoteImagePath(after))).toBe(true);
  expect(existsSync(panelDir(after))).toBe(false);
  expect(existsSync(videoPath(after, false))).toBe(false);
  expect(existsSync(videoPath(after, true))).toBe(false);
});
it("tukar nomor dua bagian berjudul sama tidak bentrok; folder yang tidak ada diabaikan", () => {
  const a = ref(1, "Buku", "Sama", 1),
    b = ref(2, "Buku", "Sama", 2);
  touch(path.join(audioDir(a), "a.mp3"));
  touch(path.join(audioDir(b), "b.mp3"));
  moveChapterOutputs([
    { before: a, after: { ...a, part_number: 2 } },
    { before: b, after: { ...b, part_number: 1 } },
    { before: ref(3, "Buku", "Kosong", 3), after: ref(3, "Buku", "Kosong", 5) },
  ]);
  expect(
    existsSync(path.join(audioDir({ ...a, part_number: 2 }), "a.mp3")),
  ).toBe(true);
  expect(
    existsSync(path.join(audioDir({ ...b, part_number: 1 }), "b.mp3")),
  ).toBe(true);
});
it("hapus bagian: hanya folder bagian itu yang hilang, folder buku kosong ikut dibersihkan", () => {
  const a = ref(1, "Buku", "Satu", 1),
    b = ref(2, "Buku", "Dua", 2);
  touch(quoteImagePath(a));
  touch(quoteImagePath(b));
  touch(path.join(outputRoot(), "stock", "x.jpg"));
  removeChapterOutputs(a);
  expect(existsSync(chapterDir(a))).toBe(false);
  expect(existsSync(quoteImagePath(b))).toBe(true);
  removeChapterOutputs(b);
  expect(existsSync(path.join(outputRoot(), "buku"))).toBe(false);
  // Kolam stok dan folder lain tidak tersentuh.
  expect(readdirSync(path.join(outputRoot(), "stock"))).toEqual(["x.jpg"]);
});
