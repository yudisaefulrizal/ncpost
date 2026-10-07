import { it, expect } from "vitest";
import {
  status,
  nextStep,
  matchFilter,
  groupByBook,
} from "../src/client/status";
it("status mentah dipetakan ke enam tone", () => {
  expect(status("siap")).toEqual({ tone: "ok", label: "Lolos" });
  expect(status("tersedia: IMAGE_HORIZONTAL").tone).toBe("ok");
  expect(status("failed").tone).toBe("block");
  expect(status("running").tone).toBe("run");
  expect(status("revisi").tone).toBe("act");
  expect(status(null)).toEqual({ tone: "none", label: "Belum" });
});
it("satu langkah berikutnya per bab", () => {
  expect(nextStep({ article: "" })).toBe("Buat artikel");
  expect(nextStep({ article: "x", article_status: "revisi" })).toBe(
    "Sunting draf",
  );
  expect(nextStep({ article: "x", article_status: "menunggu editor" })).toBe(
    "Review editor",
  );
  expect(
    nextStep({ article: "x", article_status: "siap", visual_status: "belum" }),
  ).toBe("Buat gambar");
  expect(
    nextStep({
      article: "x",
      article_status: "siap",
      visual_status: "tersedia: IMAGE_HORIZONTAL",
    }),
  ).toBe("Lihat detail");
});
it("filter dan pengelompokan per buku", () => {
  const rows = [
    { book: "A", article: "", article_status: "belum" },
    { book: "A", article: "x", article_status: "revisi" },
    {
      book: "B",
      article: "x",
      article_status: "siap",
      visual_status: "belum",
    },
  ];
  expect(rows.filter((r) => matchFilter(r, "tindakan"))).toHaveLength(1);
  expect(rows.filter((r) => matchFilter(r, "belum"))).toHaveLength(1);
  expect(groupByBook(rows).map((g) => [g.book, g.rows.length])).toEqual([
    ["A", 2],
    ["B", 1],
  ]);
});
it("grup buku tidak membedakan huruf besar/kecil", () => {
  expect(groupByBook([{ book: "48 Hukum" }, { book: "48 hukum" }]).length).toBe(
    1,
  );
});
