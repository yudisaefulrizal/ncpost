import { it, expect } from "vitest";
import { sanitizeForTts, ttsNarration } from "../src/server/tts-text";
it("sanitasi eleven_v3: markdown, #, pasangan /…/ dibuang; bracket dipertahankan", () => {
  expect(
    sanitizeForTts(
      "Dalam buku *48 Hukum*, **kuasa**  #tag /ipa/ [sighs] dan/atau",
    ),
  ).toBe("Dalam buku 48 Hukum, kuasa tag ipa [sighs] dan/atau");
});
it("panel 1 = heading. [pause] paragraf; panel lain hanya paragraf", () => {
  expect(ttsNarration("Judul *Bagian*", "Satu   dua.", true)).toBe(
    "Judul Bagian. [pause] Satu dua.",
  );
  expect(ttsNarration("Judul", "Tiga.", false)).toBe("Tiga.");
});
