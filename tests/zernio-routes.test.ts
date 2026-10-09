import { DEFAULT_BOOK_SETTINGS } from "../src/server/book-settings";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import path from "node:path";
import { zernioRouter } from "../src/server/zernio-routes";
import { zernioAccounts, zernioRequest } from "../src/server/zernio";
vi.mock("../src/server/zernio", async (original) => ({
  ...(await original<typeof import("../src/server/zernio")>()),
  zernioAccounts: vi.fn(),
  zernioRequest: vi.fn(),
}));
const accountId = "66b2e19d8c3f5a7e9d0b1c2d";
const postId = "66b2e19d8c3f5a7e9d0b1c2e";
const testDir = path.join(process.cwd(), "output/.test/zernio-route");
const publicDir = path.join(process.cwd(), "output/public");
let beforeFiles: Set<string>;
beforeEach(() => {
  vi.stubEnv("NCPOST_TEST", "true");
  mkdirSync(testDir, { recursive: true });
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(path.join(testDir, "video-v.mp4"), "mock-rendered-video");
  beforeFiles = new Set(readdirSync(publicDir));
  vi.mocked(zernioAccounts).mockResolvedValue({
    state: "connected",
    reason: "",
    accounts: [{ id: accountId, platform: "youtube", username: "channel" }],
  });
});
afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
  for (const f of readdirSync(publicDir))
    if (!beforeFiles.has(f)) rmSync(path.join(publicDir, f), { force: true });
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function setup(query: any) {
  const store: any = { list: vi.fn().mockResolvedValue([]), db: { query } };
  const router = zernioRouter(() => store);
  const layer = (router as any).stack.find(
    (l: any) => l.route?.path === "/posts" && l.route.methods.post,
  );
  const handler = layer.route.stack[0].handle;
  const response: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const request = {
    body: {
      accountId,
      videoKey: "news:1:v",
      content: "Caption",
      title: "Title",
      visibility: "private",
      consent: true,
    },
  };
  return { handler, request, response };
}
function queryMock(duplicate = false) {
  return vi.fn(async (sql: string) => {
    if (sql.includes("FROM content_types"))
      return [
        [
          {
            id: 2,
            name: "Berita",
            engine: "news",
            outputs: '["ARTICLE","PANEL","VIDEO_KALIMAT"]',
            settings: null,
          },
        ],
      ];
    if (sql.startsWith("SELECT content_type_id"))
      return [[{ content_type_id: 2 }]];
    if (sql.startsWith("SELECT settings"))
      return [
        [
          {
            settings: JSON.stringify({
              ...DEFAULT_BOOK_SETTINGS,
              youtubeAccountId: accountId,
              tiktokAccountId: accountId,
            }),
          },
        ],
      ];
    if (sql.startsWith("SELECT n.id"))
      return [
        [
          {
            id: 1,
            title: "News",
            attempts: 1,
            kind: "VIDEO_KALIMAT",
            data: JSON.stringify({
              file: "output/.test/zernio-route/video-v.mp4",
              renderedAt: "2026-10-08",
            }),
          },
        ],
      ];
    if (sql.startsWith("INSERT")) {
      if (duplicate)
        throw Object.assign(Error("duplicate"), { code: "ER_DUP_ENTRY" });
      return [{ insertId: 7 }];
    }
    return [{}];
  });
}
it("records the provider post id and status after sending a server-owned video", async () => {
  const query = queryMock();
  vi.mocked(zernioRequest).mockResolvedValue({
    post: { _id: postId, status: "publishing", platforms: [] },
  });
  const { handler, request, response } = setup(query);
  await handler(request, response);
  expect(response.status).toHaveBeenCalledWith(201);
  expect(query).toHaveBeenCalledWith(expect.stringContaining("SET post_id=?"), [
    postId,
    "publishing",
    expect.any(String),
    7,
  ]);
  expect(zernioRequest).toHaveBeenCalledWith(
    "/posts",
    expect.objectContaining({
      method: "POST",
      headers: { "x-request-id": expect.stringMatching(/^[a-f0-9]{64}$/) },
    }),
  );
});
it("does not submit or copy another public video for an existing fingerprint", async () => {
  const { handler, request, response } = setup(queryMock(true));
  await expect(handler(request, response)).rejects.toThrow("sudah dikirim");
  expect(zernioRequest).not.toHaveBeenCalled();
  expect(new Set(readdirSync(publicDir))).toEqual(beforeFiles);
});
it("persists unknown on a network failure without retrying the publication", async () => {
  const query = queryMock();
  vi.mocked(zernioRequest).mockRejectedValue(Error("timeout"));
  const { handler, request, response } = setup(query);
  await expect(handler(request, response)).rejects.toThrow(
    "belum dapat dipastikan",
  );
  expect(zernioRequest).toHaveBeenCalledTimes(1);
  expect(query).toHaveBeenCalledWith(
    expect.stringContaining("status='unknown'"),
    [7],
  );
});
it("rejects posting when the selected account is absent", async () => {
  vi.mocked(zernioAccounts).mockResolvedValue({
    state: "connected",
    reason: "",
    accounts: [],
  });
  const query = queryMock();
  const { handler, request, response } = setup(query);
  await expect(handler(request, response)).rejects.toThrow("Pilih akun");
  expect(query).not.toHaveBeenCalled();
  expect(zernioRequest).not.toHaveBeenCalled();
});

it("publishes a panel carousel in slide order including the closing slide", async () => {
  vi.stubEnv("ZERNIO_API_KEY", "test-key");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          creator: { canPostMore: true },
          privacyLevels: [{ value: "SELF_ONLY" }],
        }),
      ),
    ),
  );
  const files = ["01-panel.jpg", "02-panel.jpg", "03-slide-penutup.jpg"];
  files.forEach((f, i) => writeFileSync(path.join(testDir, f), `slide-${i}`));
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM content_types"))
      return [
        [
          {
            id: 2,
            name: "Berita",
            engine: "news",
            outputs: '["ARTICLE","PANEL","VIDEO_KALIMAT"]',
            settings: null,
          },
        ],
      ];
    if (sql.startsWith("SELECT content_type_id"))
      return [[{ content_type_id: 2 }]];
    if (sql.startsWith("SELECT settings"))
      return [
        [
          {
            settings: JSON.stringify({
              ...DEFAULT_BOOK_SETTINGS,
              youtubeAccountId: accountId,
              tiktokAccountId: accountId,
            }),
          },
        ],
      ];
    if (sql.startsWith("SELECT n.id"))
      return [
        [
          {
            id: 1,
            title: "News",
            attempts: 1,
            kind: "PANEL",
            data: JSON.stringify({
              panels: files
                .slice(0, 2)
                .map((f) => ({ file: `output/.test/zernio-route/${f}` })),
              closing: `output/.test/zernio-route/${files[2]}`,
              renderedAt: "2026-10-08",
            }),
          },
        ],
      ];
    if (sql.startsWith("INSERT")) return [{ insertId: 8 }];
    return [{}];
  });
  vi.mocked(zernioAccounts).mockResolvedValue({
    state: "connected",
    reason: "",
    accounts: [{ id: accountId, platform: "tiktok", username: "creator" }],
  });
  vi.mocked(zernioRequest).mockImplementation(async (route: string) => {
    if (route.includes("creator-info"))
      return {
        creator: { canPostMore: true },
        privacyLevels: [{ value: "SELF_ONLY" }],
      };
    return { post: { _id: postId, status: "publishing", platforms: [] } };
  });
  const { handler, request, response } = setup(query);
  request.body = {
    ...request.body,
    videoKey: "news:1:photo",
    privacy: "SELF_ONLY",
  } as any;
  await handler(request, response);
  const call = vi
    .mocked(zernioRequest)
    .mock.calls.find(([route]) => route === "/posts")!;
  const body = JSON.parse(call[1]!.body as string);
  expect(body.mediaItems).toHaveLength(3);
  expect(
    body.mediaItems.every(
      (m: any) => m.type === "image" && m.url.endsWith(".jpg"),
    ),
  ).toBe(true);
  const { readFileSync } = await import("node:fs");
  expect(
    body.mediaItems.map((m: any) =>
      readFileSync(
        path.join(publicDir, new URL(m.url).pathname.split("/").pop()!),
        "utf8",
      ),
    ),
  ).toEqual(["slide-0", "slide-1", "slide-2"]);
  expect(body.tiktokSettings.media_type).toBe("photo");
});
