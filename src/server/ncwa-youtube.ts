import { publicationStatus } from "./publication-status";
// YouTube resmi di NC-WA: NCPost hanya memakai API key, identitas channel, dan hasil publikasi.
import { createHash } from "node:crypto";
import { zernioAccounts, type ZernioAccount } from "./zernio";
export async function ncwaYouTubeRequest(
  endpoint: string,
  init: RequestInit = {},
  request = fetch,
) {
  const key = process.env.NCWA_YOUTUBE_API_KEY || process.env.NCWA_API_KEY;
  if (!key) throw Error("API key NC-WA belum diatur di Kredensial");
  const response = await request(
    "https://ncwa.nuscode.id/api/v1/youtube" + endpoint,
    {
      ...init,
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(60000),
    },
  );
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Error(
      `NC-WA YouTube HTTP ${response.status}: ${String(data.error?.message || data.message || data.error || "gagal").slice(0, 300)}`,
    );
  return data;
}
export type SocialAccount = ZernioAccount & { channelId?: string };
export async function socialAccounts(
  request = fetch,
): Promise<{ state: string; reason: string; accounts: SocialAccount[] }> {
  const zernio = await zernioAccounts(request);
  let youtube: SocialAccount[] = [],
    reason = "",
    ncwaReady = false;
  if (process.env.NCWA_YOUTUBE_API_KEY || process.env.NCWA_API_KEY)
    try {
      const rows = await ncwaYouTubeRequest("/accounts", {}, request);
      if (!Array.isArray(rows)) throw Error("Respons channel tidak valid");
      ncwaReady = true;
      youtube = rows
        .filter((r) => /^UC[-\w]{22}$/.test(r.id) && r.status === "active")
        .map((r) => ({
          id: createHash("sha256")
            .update("ncwa-youtube:" + r.id)
            .digest("hex")
            .slice(0, 24),
          platform: "youtube",
          username: String(r.name),
          channelId: r.id,
          connectionId: "ncwa-youtube",
        }));
    } catch {
      reason =
        "Daftar YouTube NC-WA belum tersedia; periksa izin key di Kredensial.";
    }
  return {
    state:
      ncwaReady || zernio.state === "connected" ? "connected" : zernio.state,
    reason:
      reason ||
      (ncwaReady
        ? "YouTube melalui NC-WA; akun lain melalui Zernio"
        : zernio.reason),
    accounts: [...zernio.accounts, ...youtube],
  };
}
export function ncwaYouTubeSummary(data: any) {
  if (
    typeof data?.requestId !== "string" ||
    !/^[a-f0-9]{24}$/.test(data.requestId)
  )
    throw Error("Respons publikasi NC-WA tidak valid");
  return {
    id: data.requestId,
    status: publicationStatus(data.status),
    connectionId: "ncwa-youtube",
    platforms: [
      {
        platform: "youtube",
        status: publicationStatus(data.status),
        url:
          typeof data.url === "string" &&
          data.url.startsWith("https://www.youtube.com/")
            ? data.url
            : null,
        error:
          typeof data.error === "string" ? data.error.slice(0, 1000) : null,
        draft: false,
      },
    ],
  };
}
