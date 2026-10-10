import { validateUnifiedArticle, type ArticleConfig } from "./content-contract";
import { newsSentences } from "./news-production-domain";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./config";

export const NEWS_PROMPT_PATH = path.join(
  ROOT,
  "prompts/berita/skill-artikel-teknologi.md",
);
// Do not trim, interpolate, prepend or append instructions to the source prompt.
export const newsArticlePrompt = () => readFileSync(NEWS_PROMPT_PATH, "utf8");
export const NEWS_SOURCE_DOMAINS = [
  "foxnews.com",
  "theguardian.com",
  "t-online.de",
  "tech.sina.com.cn",
  "itmedia.co.jp",
  "donga.com",
  "timesofindia.indiatimes.com",
  "channelnewsasia.com",
  "khaleejtimes.com",
  "ynet.co.il",
  "mybroadband.co.za",
  "canaltech.com.br",
  "abc.net.au",
];
export function newsSourceKey(value: string, unrestricted = false) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw Error("URL sumber berita harus HTTPS tanpa kredensial");
  const host = url.hostname.replace(/^www\./, "");
  if (!unrestricted && !NEWS_SOURCE_DOMAINS.includes(host))
    throw Error("Domain sumber berita tidak diizinkan");
  url.hostname = host;
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return { host, url: url.href.replace(/\/$/, "") };
}
export function validateNewsArticle(raw: string, config?: ArticleConfig) {
  if (config) {
    const data = validateUnifiedArticle(raw, config.paragraphCount);
    const url = /https:\/\/[^\s)]+/.exec(data.source)?.[0] || null;
    if (url) {
      try {
        newsSourceKey(url, true);
      } catch (e) {
        data.errors.push((e as Error).message);
        data.ok = false;
      }
    }
    return {
      ...data,
      headings: data.heading ? [data.heading] : [],
      sourceUrl: url,
      wordCount: data.counts.reduce((a, b) => a + b, 0),
      characterCount: data.paragraphs.join("\n\n").length,
      sentenceCounts: data.paragraphs.map((p) => newsSentences(p).length),
    };
  }
  const errors: string[] = [];
  const text = raw.replace(/\r\n/g, "\n").trim();
  const lines = text.split("\n");
  const title = lines[0]?.trim() ?? "";
  if (
    !title ||
    /^[#*_`]/.test(title) ||
    lines[1]?.trim() !== "" ||
    /^(Kenapa|Mengapa)\b/i.test(title)
  )
    errors.push(
      "Satu judul teks biasa wajib di awal, tanpa header atau Kenapa/Mengapa",
    );
  const sourceAt = lines.indexOf("Sumber:");
  if (sourceAt < 0) errors.push("Blok Sumber terpisah wajib setelah isi");
  const body = lines
    .slice(1, sourceAt < 0 ? lines.length : sourceAt)
    .join("\n")
    .trim();
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length !== 4)
    errors.push("Artikel berita harus memiliki empat paragraf tanpa header");
  if (
    paragraphs.some((p) =>
      /\n\s*\n|(^|\n)#|https?:\/\/|<[^>]+>|(^|\n)(Sumber|Tag):/.test(p),
    )
  )
    errors.push("Paragraf isi tidak boleh memuat header, URL, tag, atau HTML");
  const plain = (p: string) => p.replace(/[*_`]/g, "").trim();
  const counts = paragraphs.map(
    (p) => plain(p).split(/\s+/).filter(Boolean).length,
  );
  const wordCount = counts.reduce((a, b) => a + b, 0);
  const characterCount = [...paragraphs.map(plain).join("\n\n")].length;
  const sentenceCounts = paragraphs.map((p) => newsSentences(p).length);
  if (
    paragraphs.some((p) => {
      const sentences = newsSentences(p);
      return (
        sentences.length !== 2 ||
        sentences.some((s) => !/[.!?]["'”’)]?$/.test(s))
      );
    })
  )
    errors.push("Setiap paragraf wajib tepat dua kalimat lengkap");
  const tail =
    sourceAt < 0
      ? []
      : lines
          .slice(sourceAt + 1)
          .map((l) => l.trim())
          .filter(Boolean);
  const source = /^1\. \[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/.exec(
    tail[0] ?? "",
  );
  let sourceUrl: string | null = null;
  if (!source || tail.length !== 2)
    errors.push(
      "Sumber harus satu tautan Markdown dan diikuti Tag paling akhir",
    );
  else {
    try {
      newsSourceKey(source[2]);
      sourceUrl = source[2];
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  const tags = (tail[1] ?? "")
    .replace(/^Tag:\s*/, "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (!tail[1]?.startsWith("Tag:") || !tags.length || tags.length > 5)
    errors.push("Tag wajib paling akhir, maksimal lima");
  return {
    ok: !errors.length,
    errors,
    title,
    headings: [],
    paragraphs,
    counts,
    wordCount,
    sentenceCounts,
    characterCount,
    sourceUrl,
    tags,
  };
}
export interface NewsCandidate {
  source: string;
  url: string;
  original_title: string;
  summary: string;
  selected: boolean;
  reason: string;
}
export interface NewsResult {
  article_config?: ArticleConfig;
  article: string;
  candidate_topics: NewsCandidate[];
  article_plan: {
    title: string;
    sections: { heading: string; summary: string }[];
  };
  claim_source_map: { claim: string; source_url: string; evidence: string }[];
  article_validation: {
    checks: { id: string; passed: boolean; notes: string }[];
  };
}
export function validateNewsResult(input: NewsResult) {
  if (typeof input?.article !== "string" || !input.article.trim()) {
    const reasons = Array.isArray(input?.article_validation?.checks)
      ? input.article_validation.checks
          .filter((c) => c.passed === false && typeof c.notes === "string")
          .map((c) => c.notes.trim())
          .filter(Boolean)
      : [];
    throw Error(
      `Provider tidak menghasilkan artikel${reasons.length ? `: ${reasons.join("; ")}` : ""}`,
    );
  }
  const validation = validateNewsArticle(
    input?.article ?? "",
    input.article_config,
  );
  if (!validation.ok) throw Error(validation.errors.join("; "));
  if (input.article_config) return validation;
  const candidates = input.candidate_topics;
  if (!Array.isArray(candidates) || candidates.length !== 3)
    throw Error("Wajib tiga kandidat berita");
  const hosts = candidates.map((c) => newsSourceKey(c.url).host);
  if (
    new Set(hosts).size !== 3 ||
    candidates.some(
      (c) =>
        !c.source?.trim() ||
        !c.original_title?.trim() ||
        !c.summary?.trim() ||
        typeof c.selected !== "boolean",
    )
  )
    throw Error(
      "Tiga kandidat harus berasal dari sumber berbeda dan memiliki judul serta ringkasan",
    );
  const chosen = candidates.filter((c) => c.selected);
  if (chosen.length !== 1 || !chosen[0].reason?.trim())
    throw Error("Pilih satu kandidat dengan alasan pemilihan");
  const selected = newsSourceKey(chosen[0].url).url;
  if (newsSourceKey(validation.sourceUrl!).url !== selected)
    throw Error("Sumber artikel harus sama dengan kandidat terpilih");
  if (
    !input.article_plan?.title?.trim() ||
    !input.article_plan.sections?.length
  )
    throw Error("Rencana artikel wajib tersedia");
  if (
    !Array.isArray(input.claim_source_map) ||
    !input.claim_source_map.length ||
    input.claim_source_map.some(
      (c) =>
        !c.claim?.trim() ||
        !c.evidence?.trim() ||
        newsSourceKey(c.source_url).url !== selected,
    )
  )
    throw Error("Peta klaim wajib merujuk artikel sumber terpilih");
  const checks = input.article_validation?.checks;
  if (
    !Array.isArray(checks) ||
    checks.length < 11 ||
    new Set(checks.map((c) => c.id)).size < 11 ||
    checks.some((c) => !c.id || c.passed !== true || !c.notes?.trim())
  )
    throw Error("Sebelas pemeriksaan artikel wajib lolos dengan catatan");
  return validation;
}
