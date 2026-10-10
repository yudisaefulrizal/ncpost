import { buildImageAudioVideo } from "../src/server/image-audio-video";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { newsFixture } from "./fixtures/news";
import {
  emptyNewsProduction,
  type NewsMediaJob,
} from "../src/server/news-production-domain";
import {
  DEFAULT_BOOK_SETTINGS,
  normalizeBookSettings,
} from "../src/server/book-settings";
import {
  runNewsMediaJob,
  pollNewsPublications,
} from "../src/worker/news-media";
import { generateStock } from "../src/worker/stock-generator";
import { generateCodexImage } from "../src/server/codex-image";
import { newsPostImagePrompt } from "../src/server/news-production-domain";
vi.mock("../src/server/codex-image", () => ({ generateCodexImage: vi.fn() }));
import {
  tts,
  accounts,
  publishCarousel,
  publish,
  postStatus,
} from "../src/server/providers";
import {
  renderPanel,
  pickTemplate,
  renderSubtitleFrame,
  subtitleLayout,
} from "../src/server/render";
import { buildReels } from "../src/server/video";
import { bestAsset } from "../src/server/stock-match";
import type { NewsMediaStore } from "../src/server/news-media-store";
import type { Store } from "../src/server/store";
import { edgeTts } from "../src/server/edge-tts";
vi.mock("../src/server/edge-tts", () => ({
  edgeTts: vi.fn(),
  newsTtsConfig: () => ({
    enabled: true,
    provider: "edge-tts",
    voice: "id-ID-ArdiNeural",
    rate: "+0%",
  }),
}));
vi.mock("../src/worker/stock-generator", () => ({ generateStock: vi.fn() }));
vi.mock("../src/server/providers", () => ({
  tts: vi.fn(),
  accounts: vi.fn(),
  publishCarousel: vi.fn(),
  publish: vi.fn(),
  postStatus: vi.fn(),
}));
vi.mock("../src/server/render", () => ({
  renderPanel: vi.fn(),
  pickTemplate: vi.fn(),
  renderSubtitleFrame: vi.fn(),
  subtitleLayout: vi.fn(),
  SUBTITLE_VERTICAL: {},
  SUBTITLE_LANDSCAPE: {},
}));
vi.mock("../src/server/image-audio-video", () => ({
  buildImageAudioVideo: vi.fn(),
}));
vi.mock("../src/server/video", () => ({
  buildReels: vi.fn(),
  VERTICAL: {},
  LANDSCAPE: {},
}));
vi.mock("../src/server/stock-match", async (original) => ({
  ...(await original<typeof import("../src/server/stock-match")>()),
  bestAsset: vi.fn(),
}));
vi.mock("../src/server/templates", () => ({
  SOURCE: path.join(process.cwd(), "output/.test/news-media-test-assets"),
}));
const root = path.join(process.cwd(), "output/.test/berita/media/-902");
const assetRoot = path.join(
  process.cwd(),
  "output/.test/news-media-test-assets",
);
const job = (kind: string) =>
  ({
    id: -903,
    news_id: -902,
    revision: 1,
    attempts: 1,
    kind,
    state: "running",
    force_new: 0,
    settings: JSON.stringify(
      normalizeBookSettings({
        ...DEFAULT_BOOK_SETTINGS,
        stockKinds: ["IMAGE_HORIZONTAL", "IMAGE_VERTICAL"],
        sentenceKinds: ["IMAGE_HORIZONTAL", "IMAGE_VERTICAL"],
        sentenceVideoKind: "IMAGE_VERTICAL",
        sentenceVideoHKind: "IMAGE_HORIZONTAL",
      }),
    ),
  }) as NewsMediaJob;
function harness() {
  const p = emptyNewsProduction();
  const store = {
    db: {
      query: vi.fn().mockResolvedValue([
        [
          {
            id: -902,
            state: "completed",
            attempts: 1,
            article: newsFixture().article,
          },
        ],
      ]),
    },
    heartbeat: vi.fn(),
    detail: vi.fn().mockResolvedValue(p),
    bind: vi.fn(async (j: NewsMediaJob, panel: number, asset_id: number) => {
      p.stock.push({
        kind: j.kind,
        panel,
        asset_id,
        file: "output/stock/IMAGE_VERTICAL/test.jpg",
        description: "Test",
      });
      return true;
    }),
    complete: vi.fn(async (j: NewsMediaJob, data: any) => {
      if (data) p.outputs[j.kind] = data;
      return true;
    }),
    output: vi.fn(async (j: NewsMediaJob, data: any) => {
      p.outputs[j.kind] = data;
      return true;
    }),
    fail: vi.fn(),
  };
  return {
    p,
    store: store as unknown as NewsMediaStore,
    spies: store,
    assets: { assets: vi.fn().mockResolvedValue([]) } as unknown as Store,
  };
}
beforeEach(async () => {
  process.env.NCPOST_TEST = "true";
  vi.clearAllMocks();
  vi.mocked(generateStock).mockResolvedValue(987);
  vi.mocked(bestAsset).mockReturnValue(undefined);
  vi.mocked(accounts).mockResolvedValue({
    state: "connected",
    reason: "Test mock",
    accounts: [{ id: "123", username: "news_test" }],
  });
  vi.mocked(edgeTts).mockImplementation(async (_text, file) => {
    writeFileSync(file, Buffer.alloc(101));
  });
  vi.mocked(pickTemplate).mockReturnValue({ id: "1", vertical: false } as any);
  const png = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  vi.mocked(renderPanel).mockResolvedValue(png);
  vi.mocked(renderSubtitleFrame).mockResolvedValue(png);
  vi.mocked(subtitleLayout).mockReturnValue({} as any);
  vi.mocked(buildReels).mockImplementation(async (_panels, file) => {
    writeFileSync(file, Buffer.alloc(100));
    return { file: path.basename(file), width: 1080, height: 1920 } as any;
  });
  const dir = path.join(assetRoot, "asset/closing-slide");
  mkdirSync(dir, { recursive: true });
  await sharp({
    create: { width: 1080, height: 1350, channels: 3, background: "#ffffff" },
  })
    .png()
    .toFile(path.join(dir, "slide-penutup-final.png"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(assetRoot, { recursive: true, force: true });
});
it("gambar panel berita membuat empat ikatan ke aset kolam bersama dan melanjutkan stok yang sudah terikat", async () => {
  const h = harness();
  h.p.stock.push({
    kind: "IMAGE_VERTICAL",
    panel: 1,
    asset_id: 12,
    file: "output/stock/test.jpg",
    description: "Sudah ada",
  });
  await runNewsMediaJob(h.store, h.assets, job("IMAGE_VERTICAL"));
  expect(generateStock).toHaveBeenCalledTimes(3);
  expect(h.spies.bind).toHaveBeenCalledTimes(3);
  expect(h.p.stock).toHaveLength(4);
  expect(h.spies.fail).not.toHaveBeenCalled();
});
it("reuse stok global tidak memanggil generator baru", async () => {
  const h = harness();
  vi.mocked(bestAsset).mockReturnValue({ asset: { id: 55 }, score: 1 } as any);
  await runNewsMediaJob(h.store, h.assets, job("S_IMAGE_VERTICAL"));
  expect(generateStock).not.toHaveBeenCalled();
  expect(h.spies.bind).toHaveBeenCalledTimes(8);
});
it("audio berisi kalimat berita saja; kegagalan provider tidak ditandai selesai", async () => {
  const h = harness();
  await runNewsMediaJob(h.store, h.assets, job("TTS_KALIMAT"));
  expect(edgeTts).toHaveBeenCalledTimes(8);
  expect(tts).not.toHaveBeenCalled();
  expect(h.p.outputs.TTS_KALIMAT.provider).toBe("edge-tts");
  expect(h.p.outputs.TTS_KALIMAT.voice).toBe("id-ID-ArdiNeural");
  expect(vi.mocked(edgeTts).mock.calls[0][0]).not.toContain("Kabar teknologi");
  expect(h.p.outputs.TTS_KALIMAT.sentences).toHaveLength(8);
  h.spies.complete.mockClear();
  vi.mocked(edgeTts).mockRejectedValueOnce(Error("Edge TTS tidak tersedia"));
  await runNewsMediaJob(h.store, h.assets, job("TTS_KALIMAT"));
  expect(h.spies.complete).not.toHaveBeenCalled();
  expect(h.spies.fail).toHaveBeenCalledWith(
    expect.anything(),
    "Edge TTS tidak tersedia",
  );
});
it("panel berita menghasilkan empat panel tanpa heading dan satu penutup", async () => {
  const h = harness();
  for (let panel = 1; panel <= 4; panel++)
    for (const kind of ["IMAGE_HORIZONTAL", "IMAGE_VERTICAL"])
      h.p.stock.push({
        kind,
        panel,
        asset_id: panel,
        file: "output/stock/test.jpg",
        description: "Test",
      });
  await runNewsMediaJob(h.store, h.assets, job("PANEL"));
  expect(renderPanel).toHaveBeenCalledTimes(4);
  expect(vi.mocked(renderPanel).mock.calls.every((c) => c[2] === "")).toBe(
    true,
  );
  expect(h.p.outputs.PANEL.panels).toHaveLength(4);
  expect(
    readFileSync(path.join(process.cwd(), h.p.outputs.PANEL.closing)).length,
  ).toBeGreaterThan(0);
});
it("video V/H memakai audio yang sama dan sumber stok per orientasi", async () => {
  const h = harness();
  h.p.outputs.TTS_KALIMAT = {
    sentences: Array.from({ length: 8 }, () => ({
      file: "output/.test/audio.mp3",
    })),
  };
  for (let panel = 1; panel <= 8; panel++)
    for (const kind of ["S_IMAGE_HORIZONTAL", "S_IMAGE_VERTICAL"])
      h.p.stock.push({
        kind,
        panel,
        asset_id: panel,
        file: "output/stock/test.jpg",
        description: "Test",
      });
  await runNewsMediaJob(h.store, h.assets, job("VIDEO_KALIMAT"));
  await runNewsMediaJob(h.store, h.assets, job("VIDEO_KALIMAT_H"));
  expect(buildReels).toHaveBeenCalledTimes(2);
  expect(h.p.outputs.VIDEO_KALIMAT.source).toBe("IMAGE_VERTICAL");
  expect(h.p.outputs.VIDEO_KALIMAT_H.source).toBe("IMAGE_HORIZONTAL");
  const frames = vi.mocked(renderSubtitleFrame).mock.calls;
  for (const first of [0, 8]) {
    expect(frames[first][2]).toEqual({
      heading: "Kabar teknologi baru",
      label: "Berita Teknologi · #-902",
    });
    for (let i = first + 1; i < first + 8; i++)
      expect(frames[i][2]).toBeUndefined();
  }
  // A visual heading must not shift subtitles against sentence-only audio.
  for (const [panels] of vi.mocked(buildReels).mock.calls)
    expect(panels.every((panel) => panel.heading === "")).toBe(true);
  expect(h.spies.fail).not.toHaveBeenCalled();
});
it("publikasi mencatat request sebelum mengirim; timeout menjadi unknown tanpa retry", async () => {
  const h = harness();
  for (let panel = 1; panel <= 4; panel++)
    for (const kind of ["IMAGE_HORIZONTAL", "IMAGE_VERTICAL"])
      h.p.stock.push({
        kind,
        panel,
        asset_id: panel,
        file: "output/stock/test.jpg",
        description: "Test",
      });
  await runNewsMediaJob(h.store, h.assets, job("PANEL"));
  const source = h.p.outputs.PANEL;
  vi.mocked(publishCarousel).mockImplementation(async () => {
    expect(h.p.outputs.POST_IG.requestId).toBeTruthy();
    throw Error("Timeout test");
  });
  await runNewsMediaJob(h.store, h.assets, job("POST_IG"));
  expect(publishCarousel).toHaveBeenCalledTimes(1);
  expect(h.p.outputs.POST_IG.status).toBe("unknown");
  const requestId = h.p.outputs.POST_IG.requestId;
  await runNewsMediaJob(h.store, h.assets, job("POST_IG"));
  expect(publishCarousel).toHaveBeenCalledTimes(1);
  expect(h.p.outputs.POST_IG.requestId).toBe(requestId);
  // Remove only public copies created by this test, derived from its owned files.
  const { createHash } = await import("node:crypto");
  for (const file of [
    ...source.panels.map((x: any) => x.file),
    source.closing,
  ]) {
    const name =
      createHash("sha256").update(file).digest("hex").slice(0, 32) +
      path.extname(file);
    rmSync(path.join(process.cwd(), "output/public", name), { force: true });
  }
});
it("poll publikasi hanya memeriksa request tersimpan dan tidak mengirim ulang", async () => {
  const store = {
    pendingPublications: vi.fn().mockResolvedValue([
      {
        news_id: 1,
        kind: "REELS_IG",
        data: JSON.stringify({ requestId: "req-1", status: "processing" }),
      },
    ]),
    updatePublication: vi.fn(),
  } as unknown as NewsMediaStore;
  vi.mocked(postStatus).mockResolvedValue({
    status: "published",
    mediaId: "ig-1",
  });
  await pollNewsPublications(store);
  expect(postStatus).toHaveBeenCalledWith("req-1");
  expect(store.updatePublication).toHaveBeenCalledWith(
    1,
    "REELS_IG",
    "req-1",
    expect.objectContaining({ status: "published" }),
  );
  expect(publish).not.toHaveBeenCalled();
});

it("gambar post menghasilkan satu infografis dari seluruh paragraf tanpa prasyarat gambar atau audio", async () => {
  const h = harness();
  vi.mocked(generateCodexImage).mockImplementation(
    async (_prompt, _work, file) => {
      writeFileSync(file, Buffer.alloc(100));
      return { width: 1024, height: 1536, thread: "test", output: file };
    },
  );
  await runNewsMediaJob(h.store, h.assets, job("POST_IMAGE"));
  expect(generateCodexImage).toHaveBeenCalledTimes(1);
  expect(generateCodexImage).toHaveBeenCalledWith(
    newsPostImagePrompt(newsFixture().article),
    expect.any(String),
    expect.stringMatching(/gambar-post\.jpg$/),
    "bebas",
  );
  expect(h.p.outputs.POST_IMAGE).toMatchObject({
    width: 1024,
    height: 1536,
    prompt: newsPostImagePrompt(newsFixture().article),
  });
  expect(h.p.outputs.POST_IMAGE.file).toContain("berita/media/");
  expect(h.spies.fail).not.toHaveBeenCalled();
  h.spies.complete.mockClear();
  vi.mocked(generateCodexImage).mockRejectedValueOnce(Error("Gambar gagal"));
  await runNewsMediaJob(h.store, h.assets, job("POST_IMAGE"));
  expect(h.spies.complete).not.toHaveBeenCalled();
  expect(h.spies.fail).toHaveBeenCalledWith(expect.anything(), "Gambar gagal");
});

it("direct carousel generates final slides without stocks or template rendering", async () => {
  const h = harness(),
    j = job("PANEL");
  j.settings = JSON.stringify(
    normalizeBookSettings({
      ...JSON.parse(j.settings),
      carouselMode: "direct",
      stockKinds: [],
    }),
  );
  vi.mocked(generateCodexImage).mockImplementation(
    async (_prompt, _work, file) => {
      writeFileSync(
        file,
        await sharp({
          create: { width: 100, height: 150, channels: 3, background: "white" },
        })
          .png()
          .toBuffer(),
      );
      return { width: 100, height: 150, thread: "test", output: file };
    },
  );
  await runNewsMediaJob(h.store, h.assets, j);
  expect(h.spies.fail).not.toHaveBeenCalled();
  expect(generateStock).not.toHaveBeenCalled();
  expect(renderPanel).not.toHaveBeenCalled();
  expect(h.p.outputs.PANEL).toMatchObject({
    mode: "direct",
    panels: expect.any(Array),
    closing: expect.stringContaining("05-slide-penutup.jpg"),
  });
  expect(h.p.outputs.PANEL.panels).toHaveLength(4);
  expect(generateCodexImage).toHaveBeenCalledTimes(5);
  expect(
    await sharp(
      path.join(process.cwd(), h.p.outputs.PANEL.panels[0].file),
    ).metadata(),
  ).toMatchObject({ width: 1080, height: 1350 });
});
it("direct single image is saved as a posting-ready JPEG with its final prompt", async () => {
  const h = harness(),
    j = job("POST_IMAGE");
  j.settings = JSON.stringify({
    ...JSON.parse(j.settings),
    singleImageMode: "direct",
  });
  vi.mocked(generateCodexImage).mockImplementation(
    async (_prompt, _work, file) => {
      writeFileSync(
        file,
        await sharp({
          create: { width: 100, height: 150, channels: 3, background: "white" },
        })
          .png()
          .toBuffer(),
      );
      return { width: 100, height: 150, thread: "test", output: file };
    },
  );
  await runNewsMediaJob(h.store, h.assets, j);
  expect(h.spies.fail).not.toHaveBeenCalled();
  expect(h.p.outputs.POST_IMAGE).toMatchObject({
    mode: "direct",
    width: 100,
    height: 150,
    prompt: "Buat infografis editorial yang mudah dibaca.",
  });
  expect(generateCodexImage).toHaveBeenCalledTimes(1);
});

it("ready-video rendering uses original images and audio without invoking subtitle or template renderers", async () => {
  const h = harness();
  h.p.outputs.TTS_KALIMAT = {
    sentences: Array.from({ length: 8 }, (_, i) => ({
      file: `output/.test/audio-${i + 1}.mp3`,
    })),
  };
  for (let i = 1; i <= 8; i++)
    for (const kind of ["S_IMAGE_LAB_9_V", "S_IMAGE_LAB_9_H"])
      h.p.stock.push({
        kind,
        panel: i,
        asset_id: i,
        file: `output/stock/frame-${i}.jpg`,
        description: "Final",
      });
  vi.mocked(buildImageAudioVideo).mockResolvedValue({
    mode: "image_audio",
  } as any);
  for (const kind of ["VIDEO_KALIMAT", "VIDEO_KALIMAT_H"]) {
    const j = job(kind);
    j.settings = JSON.stringify({
      ...JSON.parse(j.settings),
      sentenceVideoKind: "IMAGE_LAB_9_V",
      sentenceVideoHKind: "IMAGE_LAB_9_H",
      sentenceVideoMode: "direct",
      sentenceVideoHMode: "direct",
    });
    await runNewsMediaJob(h.store, h.assets, j);
    expect(h.p.outputs[kind].mode).toBe("image_audio");
  }
  expect(buildImageAudioVideo).toHaveBeenCalledTimes(2);
  const slides = vi.mocked(buildImageAudioVideo).mock.calls[0][0];
  expect(slides).toHaveLength(8);
  expect(slides[0].image).toContain("frame-1.jpg");
  expect(slides[7].audio).toContain("audio-8.mp3");
  expect(subtitleLayout).not.toHaveBeenCalled();
  expect(renderSubtitleFrame).not.toHaveBeenCalled();
  expect(buildReels).not.toHaveBeenCalled();
  expect(h.spies.fail).not.toHaveBeenCalled();
});

it("explicit repost sends a published news carousel with a new request and still blocks uncertain attempts", async () => {
  const h = harness();
  for (let panel = 1; panel <= 4; panel++)
    for (const kind of ["IMAGE_HORIZONTAL", "IMAGE_VERTICAL"])
      h.p.stock.push({
        kind,
        panel,
        asset_id: panel,
        file: "output/stock/test.jpg",
        description: "Test",
      });
  await runNewsMediaJob(h.store, h.assets, job("PANEL"));
  const source = h.p.outputs.PANEL;
  h.p.outputs.POST_IG = { status: "published", requestId: "previous-request" };
  await runNewsMediaJob(h.store, h.assets, job("POST_IG"));
  expect(publishCarousel).not.toHaveBeenCalled();
  const repost = { ...job("POST_IG"), id: -904, force_new: 1 };
  vi.mocked(publishCarousel).mockResolvedValue({
    status: "publishing",
    mediaId: "new-media",
  } as any);
  await runNewsMediaJob(h.store, h.assets, repost);
  expect(publishCarousel).toHaveBeenCalledWith(
    expect.objectContaining({ requestId: "ncpost-news-post--902--904" }),
  );
  expect(h.p.outputs.POST_IG.requestId).not.toBe("previous-request");
  h.p.outputs.POST_IG.status = "unknown";
  await runNewsMediaJob(h.store, h.assets, { ...repost, id: -905 });
  expect(publishCarousel).toHaveBeenCalledTimes(1);
  const { createHash } = await import("node:crypto");
  for (const file of [...source.panels.map((p: any) => p.file), source.closing])
    rmSync(
      path.join(
        process.cwd(),
        "output/public",
        createHash("sha256").update(file).digest("hex").slice(0, 32) +
          path.extname(file),
      ),
      { force: true },
    );
});
