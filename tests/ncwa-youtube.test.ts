import { afterEach, expect, it, vi } from "vitest";
import {
  socialAccounts,
  ncwaYouTubeRequest,
  ncwaYouTubeSummary,
} from "../src/server/ncwa-youtube";
const channel = "UC" + "a".repeat(22);
afterEach(() => vi.unstubAllEnvs());
it("merges official channels and Zernio without exposing Google tokens", async () => {
  vi.stubEnv("NCWA_API_KEY", "test-key");
  vi.stubEnv("NCWA_YOUTUBE_API_KEY", "");
  vi.stubEnv("ZERNIO_API_KEY", "");
  vi.stubEnv("ZERNIO_CONNECTIONS", "");
  const request = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify([
        {
          id: channel,
          name: "Channel",
          status: "active",
          access_token: "private",
        },
        { id: "bad", name: "No", status: "active" },
      ]),
    ),
  );
  const result = await socialAccounts(request);
  expect(result.state).toBe("connected");
  expect(result.accounts).toHaveLength(1);
  expect(result.accounts[0]).toMatchObject({
    platform: "youtube",
    channelId: channel,
    connectionId: "ncwa-youtube",
  });
  expect(result.accounts[0].id).toMatch(/^[a-f0-9]{24}$/);
  expect(JSON.stringify(result)).not.toMatch(/private|test-key/);
  expect(request.mock.calls[0][0]).toBe(
    "https://ncwa.nuscode.id/api/v1/youtube/accounts",
  );
});
it("missing YouTube scope does not break Zernio list", async () => {
  vi.stubEnv("NCWA_API_KEY", "test-key");
  vi.stubEnv("NCWA_YOUTUBE_API_KEY", "");
  vi.stubEnv("ZERNIO_API_KEY", "zernio-key");
  vi.stubEnv("ZERNIO_CONNECTIONS", "");
  const request = vi.fn(async (url: Parameters<typeof fetch>[0]) =>
    String(url).includes("zernio.com")
      ? new Response(
          JSON.stringify({
            accounts: [
              { _id: "a".repeat(24), platform: "tiktok", username: "TikTok" },
            ],
          }),
        )
      : new Response("{}", { status: 403 }),
  );
  const result = await socialAccounts(request);
  expect(result.state).toBe("connected");
  expect(result.accounts).toHaveLength(1);
  expect(result.accounts[0].platform).toBe("tiktok");
  expect(result.reason).toContain("izin key");
});
it("counts uncertain outcomes as published and preserves provider errors", async () => {
  expect(
    ncwaYouTubeSummary({
      requestId: "a".repeat(24),
      status: "unknown",
      error: "Kuota habis",
    }),
  ).toMatchObject({
    status: "published",
    connectionId: "ncwa-youtube",
    platforms: [{ error: "Kuota habis" }],
  });
  expect(() => ncwaYouTubeSummary({ requestId: "bad" })).toThrow();
  vi.stubEnv("NCWA_API_KEY", "key");
  await expect(
    ncwaYouTubeRequest(
      "/accounts",
      {},
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { message: "Key tidak punya izin" } }),
            { status: 403 },
          ),
        ),
    ),
  ).rejects.toThrow("Key tidak punya izin");
});

it("sends a produced video to NC-WA and keeps request ID for uncertain delivery", async () => {
  vi.stubEnv("NCPOST_TEST", "true");
  vi.stubEnv("NCWA_API_KEY", "key");
  vi.stubEnv("NCWA_YOUTUBE_API_KEY", "");
  vi.stubEnv("ZERNIO_API_KEY", "");
  vi.stubEnv("ZERNIO_CONNECTIONS", "");
  const { mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { chapterDir } = await import("../src/server/output-paths");
  const { ROOT } = await import("../src/server/config");
  const { publishZernio } = await import("../src/server/zernio-routes");
  const path = await import("node:path");
  const id = (
    await socialAccounts(
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify([
              { id: channel, name: "Channel", status: "active" },
            ]),
          ),
        ),
    )
  ).accounts[0].id;
  const chapter = {
    id: 999997,
    book: "YouTube integration fixture",
    title: "Video",
    part_number: 1,
    article: "Paragraf pertama",
    revision: 1,
    sentence_video: JSON.stringify({ file: "video-v.mp4", renderedAt: 123 }),
    content_type_id: 1,
  };
  const dir = chapterDir(chapter);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "video-v.mp4"), "fixture");
  let savedRequest = "",
    savedConnection = "",
    copied: string | undefined;
  let upload: any;
  const queries: any[] = [];
  const store: any = {
    list: async () => [chapter],
    chapter: async () => chapter,
    bookSettings: async () => ({
      socialTargets: ["youtube"],
      youtubeAccountId: id,
      youtube: { visibility: "unlisted", madeForKids: true, synthetic: false },
    }),
    db: {
      query: async (sql: string, params: any[]) => {
        queries.push([sql, params]);
        if (sql.startsWith("SELECT n.id")) return [[]];
        if (sql.startsWith("INSERT INTO zernio_publications"))
          return [{ insertId: 9 }];
        if (sql.includes("SET post_id=?,result=?")) {
          savedRequest = params[0];
          savedConnection = params[1];
        }
        return [{}];
      },
    },
  };
  const mock = vi.fn(async (url: any, init: any) => {
    if (String(url).endsWith("/accounts"))
      return new Response(
        JSON.stringify([{ id: channel, name: "Channel", status: "active" }]),
      );
    upload = JSON.parse(init.body);
    copied = new URL(upload.videoUrl).pathname.split("/").pop();
    return new Response(
      JSON.stringify({ requestId: upload.requestId, status: "queued" }),
    );
  });
  vi.stubGlobal("fetch", mock);
  try {
    const result = await publishZernio(store, {
      quickYouTube: true,
      source: "book:999997",
    });
    expect(result.connectionId).toBe("ncwa-youtube");
    expect(upload).toMatchObject({
      channelId: channel,
      title: "Video",
      description: "",
      privacyStatus: "unlisted",
      madeForKids: true,
      containsSyntheticMedia: false,
    });
    expect(savedRequest).toBe(upload.requestId);
    expect(JSON.parse(savedConnection).connectionId).toBe("ncwa-youtube");
    expect(
      mock.mock.calls.every(([url]) => !String(url).includes("zernio.com")),
    ).toBe(true);
  } finally {
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
    if (copied)
      rmSync(path.join(ROOT, "output/public", copied), { force: true });
  }
});
