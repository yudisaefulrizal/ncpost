export interface TikTokSettings {
  media: "v" | "h" | "photo";
  privacy: string;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  synthetic: boolean;
  autoMusic: boolean;
}
export const DEFAULT_TIKTOK_SETTINGS: TikTokSettings = {
  media: "v",
  privacy: "",
  allowComment: false,
  allowDuet: false,
  allowStitch: false,
  synthetic: true,
  autoMusic: false,
};
export function normalizeTikTokSettings(input: any): TikTokSettings {
  if (input == null) return { ...DEFAULT_TIKTOK_SETTINGS };
  const value = { ...DEFAULT_TIKTOK_SETTINGS, ...input };
  if (
    !["v", "h", "photo"].includes(value.media) ||
    typeof value.privacy !== "string" ||
    value.privacy.length > 80
  )
    throw Error("Pengaturan TikTok tidak valid");
  for (const key of [
    "allowComment",
    "allowDuet",
    "allowStitch",
    "synthetic",
    "autoMusic",
  ] as const)
    if (typeof value[key] !== "boolean")
      throw Error("Pengaturan TikTok tidak valid");
  return {
    media: value.media,
    privacy: value.privacy,
    allowComment: value.allowComment,
    allowDuet: value.allowDuet,
    allowStitch: value.allowStitch,
    synthetic: value.synthetic,
    autoMusic: value.autoMusic,
  };
}
