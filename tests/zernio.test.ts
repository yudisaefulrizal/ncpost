import { afterEach, expect, it, vi } from "vitest";
import {
  zernioAccounts,
  zernioPlatform,
  zernioPostBody,
  zernioPostSummary,
  zernioRequest,
} from "../src/server/zernio";
const id = "66b2e19d8c3f5a7e9d0b1c2d";
const video =
  "https://ncpost.nuscode.id/pub/01234567890123456789012345678901.mp4";
afterEach(() => vi.unstubAllEnvs());
it("does not contact Zernio without an API key", async () => {
  vi.stubEnv("ZERNIO_API_KEY", "");
  const request = vi.fn();
  expect((await zernioAccounts(request)).state).toBe("disconnected");
  expect(request).not.toHaveBeenCalled();
});
it("only exposes active YouTube/TikTok accounts and never OAuth credentials", async () => {
  vi.stubEnv("ZERNIO_API_KEY", "secret-key");
  const request = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        accounts: [
          {
            _id: id,
            platform: "youtube",
            username: "channel",
            accessToken: "private-token",
          },
          {
            _id: "66b2e19d8c3f5a7e9d0b1c2e",
            platform: "tiktok",
            username: "creator",
          },
          { _id: id, platform: "instagram", username: "ignored" },
          { _id: id, platform: "tiktok", isActive: false },
        ],
      }),
    ),
  );
  const result = await zernioAccounts(request);
  expect(result.accounts.map((a) => a.platform)).toEqual(["youtube", "tiktok"]);
  expect(JSON.stringify(result)).not.toMatch(/private-token|secret-key/);
  expect(request.mock.calls[0][0]).toBe("https://zernio.com/api/v1/accounts");
  expect(request.mock.calls[0][1].headers.Authorization).toBe(
    "Bearer secret-key",
  );
  expect(() => zernioPlatform("instagram")).toThrow();
});
it("requires a reviewed video and preserves YouTube visibility and disclosure", async () => {
  const input = {
    content: "Caption",
    title: "Judul",
    visibility: "private",
    madeForKids: true,
    synthetic: true,
    consent: true,
  };
  const account = { id, platform: "youtube" as const };
  await expect(
    zernioPostBody({ ...input, consent: false }, video, account),
  ).rejects.toThrow("Setujui");
  await expect(
    zernioPostBody({ ...input, visibility: "" }, video, account),
  ).rejects.toThrow("visibilitas");
  const body = await zernioPostBody(input, video, account);
  expect(body.mediaItems).toEqual([{ type: "video", url: video }]);
  expect(body.platforms[0].platformSpecificData).toEqual({
    title: "Judul",
    visibility: "private",
    madeForKids: true,
    containsSyntheticMedia: true,
  });
  expect(body.publishNow).toBe(true);
});
it("validates TikTok privacy against creator info and prohibits disabled interactions", async () => {
  const creator = vi.fn().mockResolvedValue({
    canPostMore: true,
    privacyLevels: [{ value: "SELF_ONLY" }],
    interactions: {
      allow_comment: true,
      allow_duet: false,
      allow_stitch: false,
    },
  });
  const input = {
    content: "Caption",
    consent: true,
    privacy: "SELF_ONLY",
    synthetic: true,
  };
  const account = { id, platform: "tiktok" as const };
  await expect(
    zernioPostBody(
      { ...input, privacy: "PUBLIC_TO_EVERYONE" },
      video,
      account,
      creator,
    ),
  ).rejects.toThrow("privasi");
  await expect(
    zernioPostBody({ ...input, allow_duet: true }, video, account, creator),
  ).rejects.toThrow("Interaksi");
  const body = await zernioPostBody(input, video, account, creator);
  expect(body.tiktokSettings).toEqual({
    privacy_level: "SELF_ONLY",
    content_preview_confirmed: true,
    express_consent_given: true,
    video_made_with_ai: true,
    allow_comment: false,
    allow_duet: false,
    allow_stitch: false,
  });
  creator.mockResolvedValue({ canPostMore: false });
  await expect(zernioPostBody(input, video, account, creator)).rejects.toThrow(
    "Batas posting",
  );
});
it("keeps a 207 failed publication as failed rather than reporting success", async () => {
  vi.stubEnv("ZERNIO_API_KEY", "secret-key");
  const request = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        post: {
          _id: id,
          status: "failed",
          accessToken: "private",
          platforms: [
            {
              platform: "youtube",
              status: "failed",
              errorMessage: "private upstream details",
            },
          ],
        },
      }),
      { status: 207 },
    ),
  );
  const summary = zernioPostSummary(
    await zernioRequest("/posts", { method: "POST" }, request),
  );
  expect(summary.status).toBe("failed");
  expect(summary.platforms[0].status).toBe("failed");
  expect(JSON.stringify(summary)).not.toContain("private");
});

it("builds an ordered TikTok carousel with a separate photo description", async () => {
  const creator = vi.fn().mockResolvedValue({
    canPostMore: true,
    privacyLevels: [{ value: "SELF_ONLY" }],
    interactions: { allow_comment: true },
  });
  const urls = [
    "https://ncpost.nuscode.id/pub/first.jpg",
    "https://ncpost.nuscode.id/pub/second.jpg",
  ];
  const input = {
    content: "Deskripsi panjang ".repeat(180),
    title: "Judul carousel",
    privacy: "SELF_ONLY",
    consent: true,
    autoMusic: true,
    allow_comment: true,
    allow_duet: true,
  };
  const body = await zernioPostBody(
    input,
    urls,
    { id, platform: "tiktok" },
    creator,
  );
  expect(creator).toHaveBeenCalledWith(id, "photo");
  expect(body.content).toBe(input.title);
  expect(body.mediaItems).toEqual(urls.map((url) => ({ type: "image", url })));
  expect(body.tiktokSettings).toMatchObject({
    media_type: "photo",
    description: input.content,
    photo_cover_index: 0,
    auto_add_music: true,
    allow_comment: true,
  });
  expect(body.tiktokSettings).not.toHaveProperty("allow_duet");
  expect(body.tiktokSettings).not.toHaveProperty("allow_stitch");
  expect(body.tiktokSettings).not.toHaveProperty("video_made_with_ai");
  const draft = await zernioPostBody(
    { ...input, synthetic: true },
    urls,
    { id, platform: "tiktok" },
    creator,
  );
  expect(draft.tiktokSettings.draft).toBe(true);
  await expect(
    zernioPostBody(input, urls, { id, platform: "youtube" }, creator),
  ).rejects.toThrow("Carousel TikTok");
  await expect(
    zernioPostBody(
      input,
      Array(36).fill(urls[0]),
      { id, platform: "tiktok" },
      creator,
    ),
  ).rejects.toThrow("2–35");
});

it("filters account requests using the profile saved in credentials", async () => {
  vi.stubEnv("ZERNIO_API_KEY", "test-key");
  vi.stubEnv("ZERNIO_PROFILE_ID", id);
  const request = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ accounts: [] })));
  await zernioAccounts(request);
  expect(request.mock.calls[0][0]).toBe(
    `https://zernio.com/api/v1/accounts?profileId=${id}`,
  );
});

it("merges accounts from multiple keys and retains their owning connection", async () => {
  vi.stubEnv("ZERNIO_API_KEY", "first-key");
  vi.stubEnv("ZERNIO_PROFILE_ID", "");
  vi.stubEnv(
    "ZERNIO_CONNECTIONS",
    Buffer.from(
      JSON.stringify([
        { id: "second", name: "Second", key: "second-key", profileId: null },
      ]),
    ).toString("base64"),
  );
  const request = vi
    .fn()
    .mockImplementation(
      async (_url, init) =>
        new Response(
          JSON.stringify({
            accounts: [
              {
                _id:
                  init.headers.Authorization === "Bearer first-key"
                    ? id
                    : "66b2e19d8c3f5a7e9d0b1c2e",
                platform: "tiktok",
                username: "creator",
              },
            ],
          }),
        ),
    );
  const result = await zernioAccounts(request);
  expect(result.accounts.map((a) => a.connectionId)).toEqual([
    "legacy",
    "second",
  ]);
  expect(JSON.stringify(result)).not.toMatch(/first-key|second-key/);
  await zernioRequest("/posts", {}, request, "second");
  expect(request.mock.calls.at(-1)?.[1].headers.Authorization).toBe(
    "Bearer second-key",
  );
});
it("keeps healthy connection accounts when another key fails", async () => {
  vi.stubEnv("ZERNIO_API_KEY", "broken-key");
  vi.stubEnv(
    "ZERNIO_CONNECTIONS",
    Buffer.from(
      JSON.stringify([
        { id: "second", name: "Second", key: "working-key", profileId: null },
      ]),
    ).toString("base64"),
  );
  const request = vi
    .fn()
    .mockImplementation(async (_url, init) =>
      init.headers.Authorization === "Bearer broken-key"
        ? new Response("", { status: 401 })
        : new Response(
            JSON.stringify({ accounts: [{ _id: id, platform: "youtube" }] }),
          ),
    );
  const result = await zernioAccounts(request);
  expect(result.state).toBe("connected");
  expect(result.accounts).toHaveLength(1);
  expect(result.accounts[0].connectionId).toBe("second");
});
