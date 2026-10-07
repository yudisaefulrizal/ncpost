import { it, expect } from "vitest";
import {
  bestAsset,
  panelTokens,
  similarity,
  slugify,
} from "../src/server/stock-match";
const panel = panelTokens(
  "Aset menghasilkan uang",
  "Celengan kaca berisi koin emas di meja kayu.",
  ["keuangan"],
);
it("kemiripan = porsi kata deskripsi yang ada di panel, stopword diabaikan", () => {
  expect(similarity(panel, "celengan kaca berisi koin")).toBe(1);
  expect(similarity(panel, "celengan kaca di atas meja kayu")).toBe(0.8);
  expect(similarity(panel, "celengan kaca berisi koin perak")).toBe(0.8);
  expect(similarity(panel, "kunci rumah tergantung dinding")).toBe(0);
});
it("ikat kandidat terbaik ≥ 80%, lewati yang sudah dipakai bab ini", () => {
  const assets = [
    { id: 1, description: "celengan kaca berisi koin", usage: 3 },
    { id: 2, description: "celengan kaca berisi koin", usage: 0 },
    { id: 3, description: "celengan kaca berisi koin perak", usage: 0 },
    { id: 4, description: "kunci rumah tergantung", usage: 0 },
  ];
  expect(bestAsset(panel, assets, new Set())?.asset.id).toBe(2);
  expect(bestAsset(panel, assets, new Set([1, 2]))?.asset.id).toBe(3);
  expect(bestAsset(panel, assets, new Set([1, 2, 3]))).toBeUndefined();
});
it("nama file = heading panel", () => {
  expect(slugify("celengan kaca berisi koin")).toBe(
    "celengan-kaca-berisi-koin",
  );
  expect(slugify("Kopi pagi di café!")).toBe("kopi-pagi-di-cafe");
  expect(
    slugify("Bab ini mengajak pembaca membedakan aset dan liabilitas…"),
  ).toBe("bab-ini-mengajak-pembaca-membedakan-aset-dan-liabilitas");
});
