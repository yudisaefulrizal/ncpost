import { it, expect } from "vitest";
import { articleSentences } from "../src/server/domain";
import { stockPrompt } from "../src/server/prompts";
const article =
  "# Judul\n\n## Judul\n\nKalimat *satu*. Kalimat dua!\n\nTiga?\n\nEmpat.\n\nLima. Enam.\n\nTujuh.\n\nBerdasarkan buku B.\n\nTag: buku";
it("kalimat dipotong per . ! ? berurutan dari paragraf 1–5, tanpa markdown", () => {
  expect(articleSentences(article)).toEqual([
    { paragraph: 1, text: "Kalimat satu." },
    { paragraph: 1, text: "Kalimat dua!" },
    { paragraph: 2, text: "Tiga?" },
    { paragraph: 3, text: "Empat." },
    { paragraph: 4, text: "Lima." },
    { paragraph: 4, text: "Enam." },
    { paragraph: 5, text: "Tujuh." },
  ]);
});
it("prompt kalimat = prompt lajur yang sama, teksnya kalimat", () => {
  expect(stockPrompt("IMAGE_VERTICAL", "Kalimat satu.", "")).toBe(
    "Editorial photorealistic stock photo, portrait orientation, a relevant real-world visual metaphor for: Kalimat satu. clean modern composition, no readable text, no logos, no watermark, no human faces. Jika ada perempuan, kenakan hijab.",
  );
  expect(stockPrompt("IMAGE_PAPERCUT_HORIZONTAL", "Kalimat satu.", "")).toMatch(
    /landscape 16:9, Kalimat satu\.$/,
  );
  // Prompt panel tetap sama.
  expect(stockPrompt("IMAGE_HORIZONTAL", "H", "P")).toContain(
    "for: H — P clean",
  );
});
