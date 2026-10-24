// Pembersihan penyimpanan: video dan gambar siap posting dihapus setelah
// semua sosmed yang dituju terbit. Berkas hilang, tetapi hasilnya tetap
// tercatat (penanda "deleted") agar jadwal tidak membuatnya lagi.
import {
  socialTargets,
  type BookSettings,
  type InstagramFormat,
} from "./book-settings";
import { instagramFormats, NEEDS_OUTPUT, youtubeMediaFor } from "./social-plan";
import { normalizeTikTokSettings } from "./tiktok-settings";

/** Hasil akhir yang berkasnya bisa dibersihkan, dan jenis isi manifestnya. */
export const CLEAN_KINDS = {
  VIDEO_KALIMAT: "file",
  VIDEO_KALIMAT_H: "file",
  PANEL: "panels",
  POST_IMAGE: "file",
} as const;
export type CleanKind = keyof typeof CLEAN_KINDS;

const parse = (raw: unknown): any => {
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
};
/** Manifest yang berkasnya sudah dibersihkan. */
export const isGone = (raw: unknown) => !!parse(raw)?.deleted;
/** Manifest yang sama dengan penanda dibersihkan. */
export const markGone = (raw: unknown, at = new Date()) =>
  JSON.stringify({ ...parse(raw), deleted: true, deletedAt: at.toISOString() });
/** Berkas yang dirujuk manifest (relatif; urutan panel dipertahankan). */
export function manifestFiles(kind: CleanKind, raw: unknown): string[] {
  const m = parse(raw);
  if (!m) return [];
  const files =
    CLEAN_KINDS[kind] === "panels"
      ? [...(m.panels || []).map((p: any) => p?.file), m.closing]
      : [m.file];
  return files.filter(
    (f): f is string => typeof f === "string" && f.length > 0,
  );
}

/** Posting yang dituju satu konten, berdasarkan Rencana konten sosmed. */
export type PostTargets = {
  instagram: InstagramFormat[];
  tiktok: boolean;
  youtube: boolean;
};
/** Posting yang sudah terbit untuk satu konten. */
export type Published = {
  carousel: boolean;
  reels: boolean;
  tiktok: boolean;
  youtube: boolean;
};
export function requiredPosts(
  outputs: string[],
  settings: BookSettings | null,
  engine = "book",
): PostTargets {
  const none: PostTargets = { instagram: [], tiktok: false, youtube: false };
  if (!settings) return none;
  const targets = socialTargets(settings);
  const has = (kind: string) => outputs.includes(kind);
  const hasVideo = has("VIDEO_KALIMAT") || has("VIDEO_KALIMAT_H");
  const tiktok = normalizeTikTokSettings(settings.tiktok);
  return {
    instagram:
      targets.includes("instagram") && engine !== "quote"
        ? instagramFormats(settings).filter((f) => has(NEEDS_OUTPUT[f]))
        : [],
    // Sosmed tanpa akun atau privasi tidak bisa diposting, jadi tidak ditunggu.
    tiktok:
      targets.includes("tiktok") &&
      !!settings.tiktokAccountId &&
      !!tiktok.privacy &&
      has(NEEDS_OUTPUT[tiktok.media]),
    youtube:
      targets.includes("youtube") &&
      !!settings.youtubeAccountId &&
      hasVideo &&
      has(NEEDS_OUTPUT[youtubeMediaFor(settings)]),
  };
}
export const hasTargets = (r: PostTargets) =>
  r.instagram.length > 0 || r.tiktok || r.youtube;
/** Semua posting yang dituju sudah terbit (dan minimal ada satu yang dituju). */
export const allPublished = (r: PostTargets, p: Published) =>
  hasTargets(r) &&
  r.instagram.every((format) => p[format]) &&
  (!r.tiktok || p.tiktok) &&
  (!r.youtube || p.youtube);
