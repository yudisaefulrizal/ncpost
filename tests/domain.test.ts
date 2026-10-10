import { describe, it, expect } from "vitest";
import {
  validateArticle,
  validateDraft,
  parseHook,
  mergeHook,
  roundRobin,
} from "../src/server/domain";
import { templates, overlayPath } from "../src/server/templates";
const P = "Ini paragraf tentang kebiasaan yang bisa diterapkan.";
// Draf Codex (sebelum hook): heading identik judul + lima paragraf.
const draft =
  "# Judul\n\n## Judul\n\n" +
  Array(5).fill(P).join("\n\n") +
  "\n\nBerdasarkan buku Atomic Habits.\n\nTag: #buku, #kebiasaan";
// Artikel final: heading hook + paragraf hook + lima paragraf.
const valid =
  "# Judul\n\n## Heading Hook\n\nHook satu. Hook dua?\n\n" +
  Array(5).fill(P).join("\n\n") +
  "\n\nBerdasarkan buku Atomic Habits.\n\nTag: #buku, #kebiasaan";
describe("Kontrak artikel", () => {
  it("tanpa batas kata atau kalimat di validator", () => {
    const long =
      Array(30).fill("kata").join(" ") +
      ". " +
      Array(30).fill("lagi").join(" ") +
      "?";
    expect(validateArticle(valid.replace(P, long)).ok).toBe(true);
  });
  it("artikel final: heading hook + enam paragraf", () => {
    const v = validateArticle(valid);
    expect(v.ok).toBe(true);
    expect(v.heading).toBe("Heading Hook");
    expect(v.paragraphs).toHaveLength(6);
    expect(v.paragraphs[0]).toBe("Hook satu. Hook dua?");
  });
  it("draf: heading identik judul + lima paragraf; tidak sah sebagai final", () => {
    expect(validateDraft(draft).ok).toBe(true);
    expect(validateArticle(draft).ok).toBe(false);
    expect(validateDraft(valid).ok).toBe(false);
  });
  it.each([
    valid.replace("Ini paragraf", "## Tambahan\nIni paragraf"),
    valid.replace("Berdasarkan buku Atomic Habits.", ""),
    valid + ", enam, tujuh, delapan, sembilan",
    valid.replace("## Heading Hook", "## "),
  ])("menolak struktur invalid", (v) =>
    expect(validateArticle(v).ok).toBe(false),
  );
});
it("hook: heading + paragraf dari keluaran Codex, digabung jadi artikel final", () => {
  expect(parseHook("## Heading Hook\n\nHook satu.\nHook dua?")).toEqual({
    heading: "Heading Hook",
    paragraph: "Hook satu. Hook dua?",
  });
  expect(parseHook("**Heading Hook**\nHook satu. Hook dua?").heading).toBe(
    "Heading Hook",
  );
  expect(() => parseHook("Hanya satu baris")).toThrow(/heading/);
  expect(
    mergeHook(draft, {
      heading: "Heading Hook",
      paragraph: "Hook satu. Hook dua?",
    }),
  ).toBe(valid);
});
it("round robin posisi bab lalu urutan buku", () => {
  expect(
    roundRobin([
      { id: 1, book: "A" },
      { id: 2, book: "A" },
      { id: 3, book: "B" },
    ]).map((x) => x.id),
  ).toEqual([1, 3, 2]);
});
it("hanya template aktif dan overlay 6 panel", () => {
  expect(templates.map((x) => x.id)).toEqual(["1", "2", "4", "4B", "6"]);
  expect(() => overlayPath("3", 1)).toThrow();
  expect(() => overlayPath("1", 7)).toThrow();
  expect(overlayPath("1", 6)).toContain("06-of-06.png");
});

it("format sumber: heading langsung paragraf dan tag multiword", () => {
  const source = valid
    .replace("## Heading Hook\n\n", "## Heading Hook\n")
    .replace("#buku, #kebiasaan", "buku, kebiasaan sehari hari");
  expect(validateArticle(source).ok).toBe(true);
  expect(validateArticle(source).tags).toEqual([
    "buku",
    "kebiasaan sehari hari",
  ]);
  expect(validateArticle(source).paragraphs[0]).toBe("Hook satu. Hook dua?");
});
it("nomor bagian memakai part_number bila ada", async () => {
  const { partNumber } = await import("../src/server/domain");
  const rows = [
    { id: 2, book: "A", part_number: 5 },
    { id: 3, book: "A", part_number: null },
    { id: 4, book: "A" },
  ];
  expect(rows.map((c) => partNumber(rows, c))).toEqual([5, 2, 3]);
});
it("nomor bagian per buku, tanpa beda huruf besar/kecil dan spasi", async () => {
  const { partNumber } = await import("../src/server/domain");
  const rows = [
    { id: 2, book: "48 hukum  kekuasaan" },
    { id: 3, book: "Atomic Habits" },
    { id: 5, book: "48 Hukum Kekuasaan" },
  ];
  expect(rows.map((c) => partNumber(rows, c))).toEqual([1, 1, 2]);
});
it("caption IG: teks biasa, #buku + tag tanpa duplikat, maks 2.200", async () => {
  const { instagramCaption } = await import("../src/server/domain");
  const article =
    "# Judul *Tebal*\n\n## Judul *Tebal*\n\nSatu *miring*.\n\nDua.\n\nTiga.\n\nEmpat.\n\nLima.\n\nBerdasarkan buku Buku, Penulis.\n\nTag: Buku, Hubungan Kerja, kekuasaan";
  const c = instagramCaption(article);
  expect(c.startsWith("Judul Tebal\n\nSatu miring.")).toBe(true);
  expect(c).toContain("Berdasarkan buku Buku, Penulis.");
  expect(c.endsWith("#buku #hubungankerja #kekuasaan")).toBe(true);
  expect(c).not.toMatch(/[*#]{2}|\*/);
  const long = article
    .replace(/Dua\./, "kata ".repeat(39) + "x.")
    .replace(/Tiga\./, "kata ".repeat(39) + "x.");
  expect([...instagramCaption(long)].length).toBeLessThanOrEqual(2200);
});
it("aturan job paralel per bagian", async () => {
  const { canStart } = await import("../src/server/domain");
  const job = (id: number, kind: string, state = "queued", chapter_id = 1) => ({
    id,
    kind,
    state,
    chapter_id,
  });
  // Tiga lajur gambar + quote bagian yang sama boleh bersamaan.
  const lanes = [
    job(1, "IMAGE_HORIZONTAL", "running"),
    job(2, "IMAGE_VERTICAL", "running"),
    job(3, "IMAGE_MINIMALIST"),
    job(4, "QUOTE"),
  ];
  expect(canStart(lanes[2], lanes)).toBe(true);
  expect(canStart(lanes[3], lanes)).toBe(true);
  // Panel menunggu job stok bagian ini (sumber panel bisa lajur mana pun).
  expect(canStart(job(5, "PANEL"), [...lanes, job(5, "PANEL")])).toBe(false);
  expect(
    canStart(job(5, "PANEL"), [job(4, "QUOTE", "running"), job(5, "PANEL")]),
  ).toBe(true);
  // Post IG menunggu Panel.
  expect(
    canStart(job(7, "POST_IG"), [job(6, "PANEL"), job(7, "POST_IG")]),
  ).toBe(false);
  // Artikel/Review berjalan sendiri dalam satu bagian, dua arah.
  expect(
    canStart(job(9, "ARTICLE"), [
      job(8, "QUOTE", "running"),
      job(9, "ARTICLE"),
    ]),
  ).toBe(false);
  expect(
    canStart(job(11, "QUOTE"), [job(10, "EDITOR"), job(11, "QUOTE")]),
  ).toBe(false);
  // Artikel yang antre belakangan tidak menahan job yang antre lebih dulu.
  expect(
    canStart(job(12, "QUOTE"), [job(12, "QUOTE"), job(13, "ARTICLE")]),
  ).toBe(true);
  // Bagian lain tidak saling menahan.
  expect(
    canStart(job(15, "ARTICLE", "queued", 2), [
      job(14, "ARTICLE", "running", 1),
      job(15, "ARTICLE", "queued", 2),
    ]),
  ).toBe(true);
});

it("accepts universal source metadata while retaining existing book articles", () => {
  const article = valid.replace(
    "Berdasarkan buku Atomic Habits.",
    "Sumber: Atomic Habits, James Clear",
  );
  const parsed = validateArticle(article);
  expect(parsed.ok).toBe(true);
  expect(parsed.paragraphs).toHaveLength(6);
  expect(parsed.attribution).toBe("Sumber: Atomic Habits, James Clear");
  expect(
    validateArticle(article.replace(parsed.attribution, "Sumber: ")).ok,
  ).toBe(false);
  expect(validateArticle(valid).ok).toBe(true);
  const updatedDraft = draft.replace(
    "Berdasarkan buku Atomic Habits.",
    "Sumber: Atomic Habits",
  );
  expect(validateDraft(updatedDraft).ok).toBe(true);
  expect(
    mergeHook(updatedDraft, { heading: "Hook", paragraph: "Pembuka." }),
  ).toContain("Sumber: Atomic Habits");
});
