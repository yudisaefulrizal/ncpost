// Isi berita diambil aplikasi sendiri, bukan oleh model: pencarian web Codex
// bukan browser, sering terblokir atau hanya mendapat potongan teks. Halaman
// diunduh lewat HTTP biasa lalu teks utamanya diambil dengan Readability
// (mesin "Reader View" Firefox). Gagal unduh atau teks terlalu pendek berarti
// berita tidak bisa diakses, dan Jurnalis mencari berita lain.
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export type NewsText = {
  url: string;
  title: string;
  siteName: string;
  published: string;
  text: string;
};
/** Teks lebih pendek dari ini dianggap bukan isi berita (paywall, blokir, dsb.). */
export const MIN_NEWS_CHARS = 500;
/** Batas teks yang diteruskan ke penulis. */
export const MAX_NEWS_CHARS = 20000;
const MAX_HTML_BYTES = 5 * 1024 * 1024;

export class NewsUnreachable extends Error {}

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
};

const clean = (text: string) =>
  text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Ambil teks utama dari HTML halaman berita. */
export function extractNewsText(html: string, url: string): NewsText {
  const { document } = parseHTML(html);
  const meta = (name: string) =>
    document
      .querySelector(`meta[property="${name}"],meta[name="${name}"]`)
      ?.getAttribute("content") ?? "";
  const published = meta("article:published_time") || meta("date");
  const parsed = new Readability(document as any).parse();
  const text = clean(parsed?.textContent ?? "");
  if (text.length < MIN_NEWS_CHARS)
    throw new NewsUnreachable(
      `Isi berita tidak terbaca (hanya ${text.length} karakter): ${url}`,
    );
  return {
    url,
    title: clean(parsed?.title ?? ""),
    siteName: clean(parsed?.siteName ?? ""),
    published: published.trim(),
    text: text.slice(0, MAX_NEWS_CHARS),
  };
}

export async function fetchNewsText(
  url: string,
  request: typeof fetch = fetch,
): Promise<NewsText> {
  let res: Response;
  try {
    res = await request(url, {
      headers: HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    throw new NewsUnreachable(
      `Berita gagal diunduh (${(e as Error).message}): ${url}`,
    );
  }
  if (!res.ok)
    throw new NewsUnreachable(
      `Berita gagal diunduh (HTTP ${res.status}): ${url}`,
    );
  const type = res.headers.get("content-type") ?? "";
  if (type && !/html/i.test(type))
    throw new NewsUnreachable(`Halaman bukan HTML (${type}): ${url}`);
  const html = await res.text();
  if (html.length > MAX_HTML_BYTES)
    throw new NewsUnreachable(`Halaman terlalu besar: ${url}`);
  return extractNewsText(html, url);
}
