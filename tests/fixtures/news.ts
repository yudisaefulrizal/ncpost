import type { NewsResult } from "../../src/server/news";
export function newsFixture(): NewsResult {
  const paragraph = Array.from(
    { length: 20 },
    (_, i) => `kata${i + 1}${i === 9 || i === 19 ? "." : ""}`,
  ).join(" ");
  return {
    article: `Kabar teknologi baru\n\n${Array(4).fill(paragraph).join("\n\n")}\n\nSumber:\n1. [The Guardian](https://www.theguardian.com/technology/2026/oct/07/test)\n\nTag: teknologi, perangkat`,
    candidate_topics: [
      {
        source: "Fox News",
        url: "https://www.foxnews.com/tech/test",
        original_title: "Kandidat satu",
        summary: "Ringkasan satu",
        selected: false,
        reason: "",
      },
      {
        source: "The Guardian",
        url: "https://www.theguardian.com/technology/2026/oct/07/test",
        original_title: "Kandidat dua",
        summary: "Ringkasan dua",
        selected: true,
        reason: "Berdampak luas bagi pembaca",
      },
      {
        source: "ABC News",
        url: "https://www.abc.net.au/news/test",
        original_title: "Kandidat tiga",
        summary: "Ringkasan tiga",
        selected: false,
        reason: "",
      },
    ],
    article_plan: {
      title: "Kabar teknologi baru",
      sections: [{ heading: "Bagian satu", summary: "Rencana artikel" }],
    },
    claim_source_map: [
      {
        claim: "Klaim fixture",
        source_url: "https://www.theguardian.com/technology/2026/oct/07/test",
        evidence: "Bukti fixture",
      },
    ],
    article_validation: {
      checks: Array.from({ length: 11 }, (_, i) => ({
        id: `cek-${i + 1}`,
        passed: true,
        notes: "Catatan fixture untuk pemeriksaan",
      })),
    },
  };
}
