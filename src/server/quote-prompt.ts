// Gaya gambar quote yang bisa dipilih per buku (Pengaturan Konten). Teks
// prompt-nya ada di prompts/quote/ (lihat src/server/prompts.ts).
export const QUOTE_IMAGE_STYLES: Record<string, { label: string }> = {
  QUOTE_PAPERCUT: { label: "Layered paper cut" },
  QUOTE_REALISTIC: { label: "Realistis" },
};
export const DEFAULT_QUOTE_IMAGE_STYLE = "QUOTE_PAPERCUT";
