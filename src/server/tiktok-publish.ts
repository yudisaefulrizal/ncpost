import { validateArticle, validateContentText } from "./domain";
import { validateNewsArticle } from "./news";
import { socialTargets, type BookSettings } from "./book-settings";
import { normalizeTikTokSettings } from "./tiktok-settings";
export function tiktokPublishInput(
  source: string,
  article: string,
  title: string,
  settings: BookSettings,
  engine?: string,
) {
  if (!/^(book|news):[1-9]\d*$/.test(source))
    throw Error("Konten TikTok tidak valid");
  if (!settings.tiktokAccountId || !socialTargets(settings).includes("tiktok"))
    throw Error("Aktifkan target dan pilih akun TikTok di Pengaturan Konten");
  const options = normalizeTikTokSettings(settings.tiktok);
  if (!options.privacy) throw Error("Atur privasi TikTok di Pengaturan Konten");
  const first = (
    source.startsWith("news:")
      ? validateNewsArticle(article)
      : validateContentText(article, engine)
  ).paragraphs[0];
  const content = first?.replace(/[*_`]/g, "").trim();
  if (!content) throw Error("Paragraf pertama artikel belum tersedia");
  return {
    mediaKey: `${source}:${options.media}`,
    accountId: settings.tiktokAccountId,
    content,
    title: title.slice(0, options.media === "photo" ? 90 : 100),
    privacy: options.privacy,
    allow_comment: options.allowComment,
    allow_duet: options.allowDuet,
    allow_stitch: options.allowStitch,
    synthetic: options.synthetic,
    autoMusic: options.autoMusic,
    consent: true,
  };
}
