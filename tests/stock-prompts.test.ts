import { it, expect } from "vitest";
import { buildPanelSnippet, panelHeading } from "../src/server/stock-prompts";
import { stockPrompt } from "../src/server/prompts";
it("prompt literal sama dengan skill sumber", () => {
  expect(stockPrompt("IMAGE_VERTICAL", "Judul", "Isi.")).toBe(
    "Editorial photorealistic stock photo, portrait orientation, a relevant real-world visual metaphor for: Judul — Isi. clean modern composition, no readable text, no logos, no watermark, no human faces. Jika ada perempuan, kenakan hijab.",
  );
  expect(stockPrompt("IMAGE_HORIZONTAL", "Judul", "Isi.")).toBe(
    "Editorial photorealistic stock photo, landscape 16:9, a relevant real-world visual metaphor for: Judul — Isi. clean modern composition, no readable text, no logos, no watermark, no human faces. Jika ada perempuan, kenakan hijab.",
  );
  expect(stockPrompt("IMAGE_MINIMALIST", "Judul", "Isi diabaikan")).toBe(
    "buat gambar Minimalist Black-and-White Line Art with Selective Color Accent Judul, portrait orientation, no text, no letters, no words, no typography, no readable text, no logos, no watermark, no human faces. Jika ada perempuan, kenakan hijab dan pakaian sopan yang menutup aurat.",
  );
  expect(stockPrompt("IMAGE_PAPERCUT", "Judul", "Isi diabaikan")).toBe(
    "Ilustrasi bergaya layered paper cut, potongan kertas berlapis dengan tekstur halus dan bayangan lembut, karakter tanpa wajah, serta komposisi rapi; jika ada perempuan, gunakan hijab dan pakaian sopan yang menutup aurat. portrait orientation, Judul",
  );
  expect(
    stockPrompt("IMAGE_PAPERCUT_HORIZONTAL", "Judul", "Isi diabaikan"),
  ).toBe(
    "Ilustrasi bergaya layered paper cut, potongan kertas berlapis dengan tekstur halus dan bayangan lembut, karakter tanpa wajah, serta komposisi rapi; jika ada perempuan, gunakan hijab dan pakaian sopan yang menutup aurat. landscape 16:9, Judul",
  );
  expect(() => stockPrompt("VIDEO", "a", "b")).toThrow();
});
it("snippet panel 2–5 seperti build_panel_snippet", () => {
  expect(buildPanelSnippet("Kalimat pendek. Kalimat kedua.")).toBe(
    "Kalimat pendek.",
  );
  expect(
    buildPanelSnippet(
      "Bab ini mengajak pembaca membedakan aset dan liabilitas melalui pengaruhnya.",
    ),
  ).toBe("Bab ini mengajak pembaca membedakan aset dan liabilitas…");
  expect(buildPanelSnippet("Dalam buku *Rich Dad*, uang mengalir.")).toBe(
    "Dalam buku Rich Dad, uang mengalir.",
  );
  expect(panelHeading("Judul Artikel", "Apa saja.", 0)).toBe("Judul Artikel");
  expect(panelHeading("Judul Artikel", "Apa saja.", 1)).toBe("Apa saja.");
});
