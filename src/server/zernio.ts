import { zernioConnections, zernioConnection } from "./zernio-connections";
const BASE = "https://zernio.com/api/v1";
export const ZERNIO_PLATFORMS = ["youtube", "tiktok"] as const;
export type ZernioPlatform = (typeof ZERNIO_PLATFORMS)[number];
export function zernioPlatform(value: unknown): ZernioPlatform {
  if (value !== "youtube" && value !== "tiktok")
    throw Error("Zernio hanya untuk YouTube dan TikTok");
  return value;
}
export function zernioId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{24}$/i.test(value))
    throw Error("ID Zernio tidak valid");
  return value;
}
export async function zernioRequest(
  endpoint: string,
  init: RequestInit = {},
  request = fetch,
  connectionId = "legacy",
) {
  const key = zernioConnection(connectionId).key;
  if (!key) throw Error("Key Zernio belum diatur di Kredensial");
  const response = await request(BASE + endpoint, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw Error(`Zernio HTTP ${response.status}`);
  return response.json();
}
export interface ZernioAccount {
  id: string;
  platform: ZernioPlatform;
  username: string;
  connectionId?: string;
}
export async function zernioAccounts(
  request = fetch,
): Promise<{ state: string; reason: string; accounts: ZernioAccount[] }> {
  const connections = zernioConnections();
  if (!connections.length)
    return {
      state: "disconnected",
      reason: "Key Zernio belum diatur",
      accounts: [],
    };
  const results = await Promise.all(
    connections.map(async (connection) => {
      try {
        const endpoint = connection.profileId
          ? `/accounts?${new URLSearchParams({ profileId: zernioId(connection.profileId) })}`
          : "/accounts";
        const data = await zernioRequest(endpoint, {}, request, connection.id);
        if (!Array.isArray(data.accounts))
          throw Error("Respons akun tidak valid");
        return data.accounts
          .filter(
            (a: any) =>
              ZERNIO_PLATFORMS.includes(a.platform) && a.isActive !== false,
          )
          .map(
            (a: any): ZernioAccount => ({
              id: zernioId(a._id),
              platform: a.platform,
              username: String(a.username || a.displayName || a.platform),
              connectionId: connection.id,
            }),
          );
      } catch {
        return null;
      }
    }),
  );
  const accounts = [
    ...new Map(results.flatMap((a) => a || []).map((a) => [a.id, a])).values(),
  ];
  const failed = results.filter((a) => a === null).length;
  return {
    state: failed === connections.length ? "error" : "connected",
    reason: failed
      ? "Sebagian koneksi Zernio tidak tersedia. Periksa Kredensial."
      : "YouTube dan TikTok melalui Zernio",
    accounts,
  };
}

export function zernioPostSummary(data: any) {
  const post = data?.post;
  if (!post || typeof post._id !== "string")
    throw Error(
      "Respons posting Zernio tidak valid; periksa dashboard Zernio sebelum mengirim ulang",
    );
  return {
    id: zernioId(post._id),
    status: String(post.status || "unknown"),
    platforms: (Array.isArray(post.platforms) ? post.platforms : [])
      .filter((p: any) => ZERNIO_PLATFORMS.includes(p.platform))
      .map((p: any) => ({
        platform: p.platform,
        status: String(p.status || "unknown"),
        url:
          typeof p.platformPostUrl === "string" &&
          /^https:\/\//.test(p.platformPostUrl)
            ? p.platformPostUrl
            : null,
        draft: p.platformSpecificData?.isDraft === true,
        error: p.errorMessage
          ? "Platform menolak posting; lihat detail di dashboard Zernio"
          : null,
      })),
  };
}
export async function zernioCreatorInfo(
  accountId: string,
  mediaType: "video" | "photo" = "video",
  connectionId = "legacy",
) {
  const data = await zernioRequest(
    `/accounts/${zernioId(accountId)}/tiktok/creator-info?mediaType=${mediaType}`,
    {},
    fetch,
    connectionId,
  );
  return {
    nickname: String(data.creator?.nickname || "TikTok"),
    canPostMore: data.creator?.canPostMore !== false,
    privacyLevels: (data.privacyLevels || []).map((p: any) => ({
      value: String(p.value),
      label: String(p.label),
    })),
    maxDuration: Number(data.postingLimits?.maxVideoDurationSec || 600),
    interactions: Object.fromEntries(
      ["allow_comment", "allow_duet", "allow_stitch"].map((k) => [
        k,
        data.postingLimits?.interactionSettings?.[k]?.enabled === true,
      ]),
    ),
  };
}
export async function zernioPostBody(
  input: any,
  videoUrl: string | string[],
  account: { id: string; platform: ZernioPlatform },
  requestCreator = zernioCreatorInfo,
) {
  const platform = zernioPlatform(account.platform);
  const photo = Array.isArray(videoUrl);
  if (
    photo &&
    (platform !== "tiktok" || videoUrl.length < 2 || videoUrl.length > 35)
  )
    throw Error("Carousel TikTok memerlukan 2–35 gambar");
  if (
    typeof input.content !== "string" ||
    !input.content.trim() ||
    input.content.length >
      (platform === "tiktok" ? (photo ? 4000 : 2200) : 5000)
  )
    throw Error("Caption kosong atau terlalu panjang");
  if (input.consent !== true)
    throw Error("Setujui pengiriman konten terlebih dahulu");
  const body: any = {
    content: input.content,
    mediaItems: photo
      ? videoUrl.map((url) => ({ type: "image", url }))
      : [{ type: "video", url: videoUrl }],
    platforms: [{ platform, accountId: account.id }],
    publishNow: true,
  };
  if (platform === "youtube") {
    if (
      typeof input.title !== "string" ||
      !input.title.trim() ||
      input.title.length > 100
    )
      throw Error("Judul YouTube wajib diisi, maksimal 100 karakter");
    if (!["public", "private", "unlisted"].includes(input.visibility))
      throw Error("Pilih visibilitas YouTube");
    body.platforms[0].platformSpecificData = {
      title: input.title,
      visibility: input.visibility,
      madeForKids: input.madeForKids === true,
      containsSyntheticMedia: input.synthetic === true,
    };
  } else {
    const creator = await requestCreator(account.id, photo ? "photo" : "video");
    if (!creator.canPostMore) throw Error("Batas posting TikTok tercapai");
    if (!creator.privacyLevels.some((p: any) => p.value === input.privacy))
      throw Error("Pilih privasi TikTok yang tersedia untuk akun ini");
    body.tiktokSettings = {
      privacy_level: input.privacy,
      content_preview_confirmed: true,
      express_consent_given: true,
      video_made_with_ai: input.synthetic === true,
    };
    if (photo) {
      if (
        typeof input.title !== "string" ||
        !input.title.trim() ||
        input.title.length > 90
      )
        throw Error("Judul carousel wajib diisi, maksimal 90 karakter");
      body.content = input.title;
      body.tiktokSettings.media_type = "photo";
      body.tiktokSettings.description = input.content;
      body.tiktokSettings.photo_cover_index = 0;
      body.tiktokSettings.auto_add_music = input.autoMusic === true;
      delete body.tiktokSettings.video_made_with_ai;
      // TikTok Business photo disclosure is completed in the TikTok app.
      if (input.synthetic === true) body.tiktokSettings.draft = true;
    }
    for (const k of photo
      ? ["allow_comment"]
      : ["allow_comment", "allow_duet", "allow_stitch"]) {
      if (input[k] === true && !creator.interactions[k])
        throw Error("Interaksi TikTok tidak tersedia untuk akun ini");
      body.tiktokSettings[k] = input[k] === true;
    }
  }
  return body;
}

export async function validateZernioSettings(
  settings: { youtubeAccountId: string | null; tiktokAccountId: string | null },
  current: { youtubeAccountId: string | null; tiktokAccountId: string | null },
) {
  const changed = (["youtube", "tiktok"] as const).filter((platform) => {
    const key = platform === "youtube" ? "youtubeAccountId" : "tiktokAccountId";
    return settings[key] && settings[key] !== current[key];
  });
  if (!changed.length) return;
  const connection = await zernioAccounts();
  for (const platform of changed) {
    const id =
      settings[platform === "youtube" ? "youtubeAccountId" : "tiktokAccountId"];
    if (
      !connection.accounts.some((a) => a.id === id && a.platform === platform)
    )
      throw Error(`Akun ${platform} tidak tersedia melalui Zernio`);
  }
}
