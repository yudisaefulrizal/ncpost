import { afterEach, expect, it, vi } from "vitest";
import { loadFinishedVideos } from "../src/client/finished-videos";
import { setContentTypeScope } from "../src/client/api";
afterEach(() => {
  vi.unstubAllGlobals();
  setContentTypeScope(null);
});
it("loads finished videos across all book and news types regardless of the previously selected scope", async () => {
  setContentTypeScope(99);
  const fetch = vi.fn(async (url: string, options: any) => {
    const scope = options.headers["X-Content-Type-Id"];
    const data =
      url === "/api/content-types"
        ? [
            { id: 1, name: "Buku", engine: "book" },
            { id: 2, name: "Berita", engine: "news" },
            { id: 3, name: "Lainnya", engine: "book" },
          ]
        : scope === "1"
          ? [
              {
                id: 7,
                title: "Buku V",
                sentence_video: JSON.stringify({
                  file: "video-v.mp4",
                  renderedAt: "baru",
                }),
              },
            ]
          : scope === "2"
            ? [
                {
                  id: 7,
                  title: "Berita H",
                  production: {
                    outputs: {
                      VIDEO_KALIMAT_H: {
                        file: "video-h.mp4",
                        renderedAt: "baru",
                      },
                    },
                  },
                },
              ]
            : [{ id: 8, title: "Belum dirender" }];
    return { ok: true, json: async () => data };
  });
  vi.stubGlobal("fetch", fetch);
  const videos = await loadFinishedVideos();
  expect(videos).toHaveLength(2);
  expect(videos.map((v) => v.key)).toEqual([
    "book:7:VIDEO_KALIMAT",
    "news:7:VIDEO_KALIMAT_H",
  ]);
  expect(videos[0].url).toBe("/api/video-kalimat/7/video-v.mp4?v=baru");
  expect(videos[1].url).toBe("/api/news/7/media/VIDEO_KALIMAT_H/0?v=baru");
  expect(
    fetch.mock.calls
      .slice(1)
      .map(([, options]) => options.headers["X-Content-Type-Id"]),
  ).toEqual(["1", "2", "3"]);
});
it("surfaces loading failures instead of reporting an empty video stock", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "Gagal memuat" }),
    })),
  );
  await expect(loadFinishedVideos()).rejects.toThrow("Gagal memuat");
});
