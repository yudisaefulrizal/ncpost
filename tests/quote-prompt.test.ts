import { it, expect } from "vitest";
import { quotePrompt } from "../src/server/prompts";
it("prompt quote = isi prompts/quote/quote.md + paragraf, tanpa tambahan dari kode", async () => {
  const { readPrompt } = await import("../src/server/prompts");
  expect(quotePrompt(["P1.", "P2.", "P3.", "P4.", "P5."])).toBe(
    readPrompt("quote/quote.md").replace(
      "{{paragraf}}",
      "P1.\n\nP2.\n\nP3.\n\nP4.\n\nP5.",
    ),
  );
});
it("judul, heading, atribusi, dan tag tidak masuk prompt quote", async () => {
  const { validateArticle } = await import("../src/server/domain");
  const v = validateArticle(
    "# Judul Artikel\n\n## Judul Artikel\nSatu.\n\nDua.\n\nTiga.\n\nEmpat.\n\nLima.\n\nBerdasarkan buku Buku, Penulis.\n\nTag: buku",
  );
  const prompt = quotePrompt(v.paragraphs);
  expect(
    prompt.endsWith("pembaca.\n\nSatu.\n\nDua.\n\nTiga.\n\nEmpat.\n\nLima."),
  ).toBe(true);
  expect(prompt).not.toMatch(/Judul Artikel|#|Berdasarkan buku|Tag:/);
});
it("prompt gambar quote = instruksi pengguna persis + quote di baris berikutnya", async () => {
  const { quoteImagePrompt } = await import("../src/server/prompts");
  expect(quoteImagePrompt("QUOTE_PAPERCUT", "Kalimat satu. Kalimat dua.")).toBe(
    "Ilustrasi bergaya **layered paper cut**, potongan kertas berlapis dengan tekstur halus dan bayangan lembut, karakter tanpa wajah, serta komposisi rapi; jika ada perempuan, gunakan hijab dan pakaian sopan yang menutup aurat. Gambarkan suasana yang mencerminkan makna kutipan, lalu sertakan teks berikut secara utuh dengan tipografi elegan dan mudah dibaca pada ruang kosong tanpa menutupi karakter:\nKalimat satu. Kalimat dua.",
  );
  expect(quoteImagePrompt("QUOTE_REALISTIC", "Q.")).toBe(
    "Foto editorial bergaya **realistis**, pencahayaan alami yang lembut, detail nyata, karakter tanpa wajah terlihat, serta komposisi rapi; jika ada perempuan, gunakan hijab. Gambarkan suasana yang mencerminkan makna kutipan, lalu sertakan teks berikut secara utuh dengan tipografi elegan dan mudah dibaca pada ruang kosong tanpa menutupi karakter:\nQ.",
  );
  expect(() => quoteImagePrompt("LAIN", "x")).toThrow();
});
it("prompt dibaca dari folder prompts/; placeholder salah ketik ditolak", async () => {
  const { fillPrompt, readPrompt } = await import("../src/server/prompts");
  expect(readPrompt("quote/quote.md").endsWith("{{paragraf}}")).toBe(true);
  expect(() => fillPrompt("quote/quote.md", {})).toThrow(/\{\{paragraf\}\}/);
});
it("prompt hook = instruksi pengguna + kelima paragraf di bawah 'Artikel:'", async () => {
  const { hookPrompt } = await import("../src/server/prompts");
  const p = hookPrompt(["P1.", "P2.", "P3.", "P4.", "P5."]);
  expect(p.startsWith("Buat 1 paragraf berisi 2 kalimat 1 heading hook")).toBe(
    true,
  );
  expect(p.endsWith("\nArtikel:\nP1.\n\nP2.\n\nP3.\n\nP4.\n\nP5.")).toBe(true);
});
