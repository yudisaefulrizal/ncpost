import { afterEach, expect, it, vi } from "vitest";
import type mysql from "mysql2/promise";
import { NewsCronStore } from "../src/server/news-cron";
import { NewsMediaStore } from "../src/server/news-media-store";
import { NewsStore } from "../src/server/news-store";
import { ContentTypeStore, withContentType } from "../src/server/content-types";
import { normalizeContentType } from "../src/server/content-type-domain";
import { emptyNewsProduction } from "../src/server/news-production-domain";
import { newsFixture } from "./fixtures/news";
afterEach(() => vi.restoreAllMocks());
it("a managed news type cron queues only its chosen stage and never the full pipeline", async () => {
  const type = {
    id: 90,
    ...normalizeContentType({
      name: "Berita",
      engine: "news",
      outputs: ["POST_IMAGE"],
    }),
  };
  type.settings.managed = true;
  vi.spyOn(ContentTypeStore.prototype, "get").mockResolvedValue(type);
  vi.spyOn(NewsStore.prototype, "list").mockResolvedValue([
    {
      id: 7,
      state: "completed",
      article: newsFixture().article,
      attempts: 1,
    } as any,
  ]);
  const create = vi.spyOn(NewsStore.prototype, "create");
  vi.spyOn(NewsMediaStore.prototype, "settings").mockResolvedValue(
    type.settings,
  );
  vi.spyOn(NewsMediaStore.prototype, "detail").mockResolvedValue(
    emptyNewsProduction(),
  );
  const enqueue = vi
    .spyOn(NewsMediaStore.prototype, "enqueueMany")
    .mockResolvedValue([19]);
  const cron = new NewsCronStore(
    {
      query: vi.fn(async () => [{ affectedRows: 1 }]),
    } as unknown as mysql.Pool,
    type.id,
  );
  vi.spyOn(cron, "list").mockResolvedValue([
    {
      book: "Berita",
      kind: "POST_IMAGE",
      enabled: true,
      intervalHours: 24,
      next_run: 1,
      last_tick: null,
      last_result: null,
    },
  ]);
  await withContentType(type, () => cron.schedule(2));
  expect(enqueue.mock.calls).toEqual([[7, ["POST_IMAGE"]]]);
  expect(create).not.toHaveBeenCalled();
});
it("missing image and audio prerequisites never trigger dependency generation", async () => {
  const type = {
    id: 91,
    ...normalizeContentType({
      name: "Berita",
      engine: "news",
      outputs: ["VIDEO_KALIMAT"],
      settings: { managed: true, sentenceVideoKind: "IMAGE_VERTICAL" },
    }),
  };
  vi.spyOn(ContentTypeStore.prototype, "get").mockResolvedValue(type);
  vi.spyOn(NewsStore.prototype, "list").mockResolvedValue([
    {
      id: 8,
      state: "completed",
      article: newsFixture().article,
      attempts: 1,
    } as any,
  ]);
  vi.spyOn(NewsMediaStore.prototype, "settings").mockResolvedValue(
    type.settings,
  );
  vi.spyOn(NewsMediaStore.prototype, "detail").mockResolvedValue(
    emptyNewsProduction(),
  );
  const enqueue = vi
    .spyOn(NewsMediaStore.prototype, "enqueueMany")
    .mockResolvedValue([]);
  const cron = new NewsCronStore(
    {
      query: vi.fn(async () => [{ affectedRows: 1 }]),
    } as unknown as mysql.Pool,
    type.id,
  );
  vi.spyOn(cron, "list").mockResolvedValue([
    {
      book: "Berita",
      kind: "VIDEO_KALIMAT",
      enabled: true,
      intervalHours: 24,
      next_run: 1,
      last_tick: null,
      last_result: null,
    },
  ]);
  await withContentType(type, () => cron.schedule(2));
  expect(enqueue).not.toHaveBeenCalled();
});

it("TikTok cron publishes only ready media and skips previously submitted content", async () => {
  const type = {
    id: 92,
    ...normalizeContentType({
      name: "Berita TikTok",
      engine: "news",
      outputs: ["POST_IMAGE"],
    }),
  };
  type.settings.socialTargets = ["tiktok"];
  type.settings.tiktokAccountId = "a".repeat(24);
  type.settings.tiktok = {
    media: "photo",
    privacy: "SELF_ONLY",
    allowComment: false,
    allowDuet: false,
    allowStitch: false,
    synthetic: true,
    autoMusic: false,
  };
  vi.spyOn(ContentTypeStore.prototype, "get").mockResolvedValue(type);
  vi.spyOn(NewsStore.prototype, "list").mockResolvedValue([
    {
      id: 8,
      title: "Berita",
      state: "completed",
      article: newsFixture().article,
      attempts: 1,
    } as any,
  ]);
  const create = vi.spyOn(NewsStore.prototype, "create");
  vi.spyOn(NewsMediaStore.prototype, "settings").mockResolvedValue(
    type.settings,
  );
  const detail = vi
    .spyOn(NewsMediaStore.prototype, "detail")
    .mockResolvedValue(emptyNewsProduction());
  const enqueue = vi.spyOn(NewsMediaStore.prototype, "enqueueMany");
  let submitted = false;
  const db = {
    query: vi.fn(async (sql: string) =>
      sql.startsWith("SELECT id FROM zernio_publications")
        ? [submitted ? [{ id: 3 }] : []]
        : [{ affectedRows: 1 }],
    ),
  } as unknown as mysql.Pool;
  const publish = vi.fn(async () => {
    submitted = true;
    return { status: "pending" };
  });
  const cron = new NewsCronStore(db, type.id, publish);
  vi.spyOn(cron, "list").mockResolvedValue([
    {
      book: "Berita",
      kind: "POST_TIKTOK",
      enabled: true,
      intervalHours: 24,
      next_run: 1,
      last_tick: null,
      last_result: null,
    },
  ]);
  await withContentType(type, () => cron.schedule(2));
  expect(publish).not.toHaveBeenCalled();
  detail.mockResolvedValue({
    ...emptyNewsProduction(),
    outputs: { PANEL: { panels: [] } },
  });
  await withContentType(type, () => cron.schedule(3));
  expect(publish).toHaveBeenCalledExactlyOnceWith("news:8");
  await withContentType(type, () => cron.schedule(4));
  expect(publish).toHaveBeenCalledTimes(1);
  expect(enqueue).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});
