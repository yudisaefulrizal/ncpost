// Rencana konten sosmed per jenis konten: apa yang diposting ke tiap akun dan
// apa yang masih menghalangi. Dipakai Pengaturan Konten dan Pusat Sosmed.
import {
  INSTAGRAM_FORMATS,
  socialTargets,
  type BookSettings,
  type InstagramFormat,
  type SocialTarget,
} from "./book-settings";
import { normalizeTikTokSettings } from "./tiktok-settings";

export const PLATFORM_LABEL: Record<SocialTarget, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};
export const PLAN_PLATFORMS: SocialTarget[] = [
  "instagram",
  "tiktok",
  "youtube",
];
export const INSTAGRAM_FORMAT_LABEL: Record<InstagramFormat, string> = {
  carousel: "Carousel",
  reels: "Reels",
};
export const TIKTOK_MEDIA_LABEL = {
  v: "Video vertikal",
  h: "Video horizontal",
  photo: "Foto carousel",
} as const;
export const YOUTUBE_MEDIA_LABEL = {
  v: "Shorts (video vertikal)",
  h: "Video horizontal",
} as const;
// Output akhir yang dibutuhkan tiap format.
export const NEEDS_OUTPUT = {
  carousel: "PANEL",
  reels: "VIDEO_KALIMAT",
  v: "VIDEO_KALIMAT",
  h: "VIDEO_KALIMAT_H",
  photo: "PANEL",
} as const;
export const OUTPUT_LABEL: Record<string, string> = {
  PANEL: "Carousel",
  VIDEO_KALIMAT: "Video vertikal",
  VIDEO_KALIMAT_H: "Video horizontal",
};

/** Media YouTube yang benar-benar dipakai saat publikasi. */
export function youtubeMediaFor(
  settings: Pick<
    BookSettings,
    "youtubeMedia" | "sentenceVideoKind" | "sentenceVideoHKind"
  >,
): "v" | "h" {
  if (settings.youtubeMedia === "h" && settings.sentenceVideoHKind) return "h";
  if (settings.youtubeMedia === "v" && settings.sentenceVideoKind) return "v";
  if (settings.sentenceVideoKind) return "v";
  if (settings.sentenceVideoHKind) return "h";
  return "v";
}

export const instagramFormats = (settings: BookSettings | null) =>
  settings?.instagramFormats ?? [...INSTAGRAM_FORMATS];

export type PlatformPlan = {
  platform: SocialTarget;
  label: string;
  active: boolean;
  accountId: string | null;
  posts: string[];
  problems: string[];
};

export function socialPlan(
  outputs: string[],
  settings: BookSettings | null,
  engine = "book",
): PlatformPlan[] {
  const targets = socialTargets(settings);
  const has = (kind: string) => outputs.includes(kind);
  const missing = (kind: string) =>
    `Butuh output ${OUTPUT_LABEL[kind] ?? kind} di Output & gambar`;
  return PLAN_PLATFORMS.map((platform) => {
    const posts: string[] = [];
    const problems: string[] = [];
    const accountId =
      (settings?.[`${platform}AccountId`] as string | null) ?? null;
    if (platform === "instagram") {
      if (engine === "quote")
        problems.push("Jenis Quote tidak memposting ke Instagram");
      else
        for (const format of instagramFormats(settings)) {
          const need = NEEDS_OUTPUT[format];
          if (has(need)) posts.push(INSTAGRAM_FORMAT_LABEL[format]);
          else
            problems.push(
              `${INSTAGRAM_FORMAT_LABEL[format]}: ${missing(need).toLowerCase()}`,
            );
        }
      if (!instagramFormats(settings).length)
        problems.push("Belum ada format yang dipilih");
    } else if (platform === "tiktok") {
      const tiktok = normalizeTikTokSettings(settings?.tiktok);
      const need = NEEDS_OUTPUT[tiktok.media];
      if (has(need)) posts.push(TIKTOK_MEDIA_LABEL[tiktok.media]);
      else
        problems.push(
          `${TIKTOK_MEDIA_LABEL[tiktok.media]}: ${missing(need).toLowerCase()}`,
        );
      if (!tiktok.privacy) problems.push("Privasi TikTok belum dipilih");
      if (!accountId) problems.push("Akun TikTok belum dipilih");
    } else {
      if (!has("VIDEO_KALIMAT") && !has("VIDEO_KALIMAT_H"))
        problems.push("YouTube butuh output Video vertikal atau horizontal");
      else if (settings)
        posts.push(YOUTUBE_MEDIA_LABEL[youtubeMediaFor(settings)]);
      if (!accountId) problems.push("Akun YouTube belum dipilih");
    }
    return {
      platform,
      label: PLATFORM_LABEL[platform],
      active: targets.includes(platform),
      accountId,
      posts,
      problems,
    };
  });
}
