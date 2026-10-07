// Kolam stok tidak terikat ke artikel: artikel yang mengikat gambar. Panel
// dicocokkan ke deskripsi gambar dengan kemiripan kata (tokenizer dan
// stopword sama dengan lib_common.py di skill sumber).
const STOPWORDS = new Set([
  "yang",
  "dan",
  "atau",
  "untuk",
  "dari",
  "ke",
  "di",
  "dengan",
  "itu",
  "ini",
  "pada",
  "adalah",
  "sebagai",
  "tanpa",
  "tetap",
  "dapat",
  "akan",
  "juga",
  "saat",
  "agar",
  "karena",
  "bukan",
  "sekadar",
  "satu",
  "para",
  "oleh",
]);
export const MATCH_THRESHOLD = 0.8;
export function tokenize(value: string) {
  const words = value.toLowerCase().match(/[a-zA-Zà-öø-ÿÀ-ÖØ-ß']+/g) ?? [];
  return new Set(words.filter((w) => !STOPWORDS.has(w) && w.length > 2));
}
export function panelTokens(
  heading: string,
  paragraph: string,
  tags: string[],
) {
  return tokenize([heading, paragraph, ...tags].join(" "));
}
// Porsi kata deskripsi gambar yang muncul di teks panel (0–1).
export function similarity(panel: Set<string>, description: string) {
  const words = tokenize(description);
  if (!words.size) return 0;
  let hit = 0;
  for (const w of words) if (panel.has(w)) hit++;
  return hit / words.size;
}
export interface StockAsset {
  id: number;
  description: string;
  usage: number;
}
// Kandidat terbaik ≥ ambang; seri dipecah oleh pemakaian paling sedikit.
export function bestAsset<T extends StockAsset>(
  panel: Set<string>,
  assets: T[],
  exclude: Set<number>,
) {
  let best: { asset: T; score: number } | undefined;
  for (const asset of assets) {
    if (exclude.has(asset.id)) continue;
    const score = similarity(panel, asset.description);
    if (
      score >= MATCH_THRESHOLD &&
      (!best ||
        score > best.score ||
        (score === best.score && asset.usage < best.asset.usage))
    )
      best = { asset, score };
  }
  return best;
}
export function slugify(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/, "") || "gambar"
  );
}
