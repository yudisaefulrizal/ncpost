import { test, expect, type Page } from "@playwright/test";

const title = "Judul Video Vektor";
const fixture = "/tests/fixtures/video-vektor-production.html";
async function setup(
  page: Page,
  options: {
    video?: boolean;
    running?: boolean;
    deleted?: boolean;
    status?: string;
    rejectPost?: boolean;
  } = {},
) {
  const requests: any[] = [];
  const posts: any[] = options.status
    ? [
        {
          id: 7,
          source_key: "book:2172:h",
          platform: "youtube",
          account_id: "a".repeat(24),
          status: options.status,
          result: {
            platforms: [
              {
                platform: "youtube",
                url:
                  options.status === "published"
                    ? "https://www.youtube.com/watch?v=fixture"
                    : null,
                error: options.status === "failed" ? "Upload gagal" : null,
              },
            ],
          },
        },
      ]
    : [];
  const rows = [
    {
      id: 2172,
      book: "Video Vektor",
      title,
      revision: 0,
      sentence_video_h:
        options.video === false
          ? null
          : JSON.stringify({
              file: "output/vector.mp4",
              deleted: !!options.deleted,
            }),
    },
  ];
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    const body = req.method() === "POST" ? req.postDataJSON() : null;
    requests.push({
      path,
      method: req.method(),
      body,
      scope: req.headers()["x-content-type-id"],
    });
    let data: any;
    if (path === "/api/chapters") data = rows;
    else if (path === "/api/jobs")
      data = [
        {
          id: 1,
          chapter_id: 2172,
          kind: "VIDEO_KALIMAT_H",
          revision: 0,
          state: options.running ? "running" : "completed",
        },
      ];
    else if (path === "/api/zernio/accounts")
      data = {
        state: "connected",
        accounts: [
          {
            id: "a".repeat(24),
            username: "channel-vector",
            platform: "youtube",
          },
          {
            id: "b".repeat(24),
            username: "creator-vector",
            platform: "tiktok",
          },
        ],
      };
    else if (path === "/api/zernio/posts" && req.method() === "GET")
      data = url.searchParams.has("source")
        ? posts.filter(
            (p) =>
              p.platform === url.searchParams.get("platform") &&
              p.account_id === url.searchParams.get("accountId") &&
              p.source_key.startsWith(url.searchParams.get("source") + ":"),
          )
        : posts;
    else if (path === "/api/zernio/posts" && req.method() === "POST") {
      if (options.rejectPost)
        return route.fulfill({
          status: 400,
          json: { error: "Akun tujuan tidak tersedia" },
        });
      const platform = body.quickYouTube ? "youtube" : "tiktok";
      posts.unshift({
        id: 8,
        source_key: "book:2172:h",
        platform,
        account_id: (platform === "youtube" ? "a" : "b").repeat(24),
        status: "publishing",
        result: { platforms: [] },
      });
      data = { status: "publishing" };
    } else if (path.endsWith("/refresh")) {
      const id = Number(path.split("/").at(-2)),
        record = posts.find((p) => p.id === id);
      data = {
        status: "published",
        platforms: [
          {
            platform: record.platform,
            url:
              record.platform === "youtube"
                ? "https://www.youtube.com/watch?v=fixture"
                : "https://www.tiktok.com/@fixture/video/1",
          },
        ],
      };
      record.status = "published";
      record.result = data;
    } else throw Error(`Unexpected API ${req.method()} ${path}`);
    await route.fulfill({ json: data });
  });
  return { requests, posts };
}
for (const platform of ["youtube", "tiktok"])
  test(`selected accounts, native ${platform} publish, progress and result link`, async ({
    page,
  }) => {
    const { requests } = await setup(page);
    await page.goto(fixture);
    await expect(
      page.getByRole("columnheader", { name: "YouTube", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "TikTok", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/@channel-vector/)).toBeVisible();
    await expect(page.getByText(/@creator-vector/)).toBeVisible();
    const publish = page.getByRole("button", {
      name: `Publikasi ${platform} ${title}`,
      exact: true,
    });
    await expect(publish).toBeEnabled();
    expect(
      requests.filter(
        (r) => r.path === "/api/zernio/posts" && r.method === "POST",
      ),
    ).toHaveLength(0);
    await publish.click();
    await expect(page.getByText("Mengunggah", { exact: true })).toBeVisible();
    await expect(page.getByText("Terbit", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Lihat postingan" }),
    ).toHaveAttribute(
      "href",
      platform === "youtube"
        ? "https://www.youtube.com/watch?v=fixture"
        : "https://www.tiktok.com/@fixture/video/1",
    );
    expect(
      requests.filter(
        (r) => r.path === "/api/zernio/posts" && r.method === "POST",
      ),
    ).toEqual([
      {
        path: "/api/zernio/posts",
        method: "POST",
        scope: "10",
        body: {
          source: "book:2172",
          quickYouTube: platform === "youtube",
          quickTikTok: platform === "tiktok",
        },
      },
    ]);
  });
for (const mode of ["unfinished", "running", "deleted"])
  test(`posting is disabled for ${mode} videos`, async ({ page }) => {
    await setup(page, {
      video: mode !== "unfinished",
      running: mode === "running",
      deleted: mode === "deleted",
    });
    await page.goto(fixture);
    await expect(
      page.getByText("Video belum siap", { exact: true }),
    ).toHaveCount(2);
    await expect(
      page.getByRole("button", {
        name: `Publikasi youtube ${title}`,
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", {
        name: `Publikasi tiktok ${title}`,
        exact: true,
      }),
    ).toBeDisabled();
  });
test("no selected platforms means no social columns or publication requests", async ({
  page,
}) => {
  const { requests } = await setup(page);
  await page.goto(fixture + "?none");
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "YouTube", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("columnheader", { name: "TikTok", exact: true }),
  ).toHaveCount(0);
  expect(requests.filter((r) => r.path.startsWith("/api/zernio"))).toHaveLength(
    0,
  );
});
test("only the selected platform appears and a missing account blocks posting", async ({
  page,
}) => {
  await setup(page);
  await page.goto(fixture + "?youtubeOnly&missingAccount");
  await expect(
    page.getByRole("columnheader", { name: "TikTok", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: `Publikasi youtube ${title}`,
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByText("Pilih akun di Pengaturan Konten", { exact: true }),
  ).toBeVisible();
});
test("confirmed failed publication can be retried explicitly", async ({
  page,
}) => {
  const { requests } = await setup(page, { status: "failed" });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(fixture);
  await expect(page.getByText("Gagal", { exact: true })).toBeVisible();
  await expect(page.getByText("Upload gagal", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await expect(page.getByText("Mengunggah", { exact: true })).toBeVisible();
  expect(
    requests.find((r) => r.path === "/api/zernio/posts" && r.method === "POST")
      ?.body,
  ).toEqual({
    source: "book:2172",
    quickYouTube: true,
    quickTikTok: false,
    retryOf: 7,
  });
});
test("uncertain delivery cannot be retried", async ({ page }) => {
  await setup(page, { status: "unknown" });
  await page.goto(fixture);
  await expect(page.getByText("unknown", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Coba lagi", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: `Publikasi youtube ${title}`,
      exact: true,
    }),
  ).toBeDisabled();
});
test("publication errors remain visible after history reload", async ({
  page,
}) => {
  await setup(page, { rejectPost: true });
  await page.goto(fixture);
  const button = page.getByRole("button", {
    name: `Publikasi youtube ${title}`,
    exact: true,
  });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole("alert")).toHaveText(
    "Akun tujuan tidak tersedia",
  );
});
