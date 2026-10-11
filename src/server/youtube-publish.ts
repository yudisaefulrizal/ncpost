import { socialTargets, type BookSettings } from "./book-settings";
export function youtubePublishInput(
  source: string,
  title: string,
  settings: BookSettings,
) {
  if (
    !settings.youtubeAccountId ||
    !socialTargets(settings).includes("youtube")
  )
    throw Error("Aktifkan target dan pilih akun YouTube di Pengaturan Konten");
  const media = settings.sentenceVideoKind
    ? "v"
    : settings.sentenceVideoHKind
      ? "h"
      : "v";
  return {
    mediaKey: `${source}:${media}`,
    accountId: settings.youtubeAccountId,
    title: title.slice(0, 100),
    visibility: "public",
    madeForKids: false,
    synthetic: false,
    ...settings.youtube,
    consent: true,
  };
}
