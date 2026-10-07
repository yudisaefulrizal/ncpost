// Teks panel untuk stok gambar (build_panel_snippet di lib_buku5.py). Prompt
// gambarnya sendiri ada di prompts/stok/ (lihat src/server/prompts.ts).
export function stripMarkdownEmphasis(value: string) {
  return value
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`(.+?)`/g, "$1");
}
export function buildPanelSnippet(paragraph: string, maxWords = 8) {
  const clean = stripMarkdownEmphasis(paragraph).trim();
  const pieces = clean.split(/(?<=[.!?])\s+|\s+—\s+|;\s+/);
  const sentence = pieces.map((p) => p.trim()).find(Boolean) ?? clean;
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return sentence;
  return (
    words
      .slice(0, maxWords)
      .join(" ")
      .replace(/[.,;:—]+$/, "") + "…"
  );
}
// Panel 1 memakai heading artikel; panel 2–5 memakai snippet paragrafnya.
export function panelHeading(title: string, paragraph: string, index: number) {
  return index === 0 ? title : buildPanelSnippet(paragraph);
}
