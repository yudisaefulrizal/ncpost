import { afterEach, expect, it, vi } from "vitest";
import {
  listUpcomingCrons,
  upcomingForType,
} from "../src/server/cron-upcoming";
import {
  ContentTypeStore,
  currentContentType,
} from "../src/server/content-types";
import { NewsCronStore } from "../src/server/news-cron";
import type { Store } from "../src/server/store";
import type { ContentType } from "../src/server/content-type-domain";
import type { BookCron } from "../src/server/cron";
afterEach(() => vi.restoreAllMocks());
const type: ContentType = {
  id: 3,
  name: "Literasi",
  engine: "book",
  outputs: ["ARTICLE"],
  settings: null,
};
const cron = (changes: Partial<BookCron> = {}): BookCron => ({
  book: "All",
  kind: "ARTICLE",
  enabled: true,
  intervalHours: 24,
  next_run: 100,
  last_tick: null,
  last_result: null,
  ...changes,
});
it("includes only enabled scheduled stages still used by the content type", () => {
  expect(
    upcomingForType(type, [
      cron(),
      cron({ enabled: false }),
      cron({ next_run: null }),
      cron({ next_run: NaN }),
      cron({ kind: "VIDEO_KALIMAT" }),
    ]),
  ).toEqual([
    {
      contentTypeId: 3,
      contentType: "Literasi",
      kind: "ARTICLE",
      label: "Artikel",
      batchSize: 1,
      nextRun: 100,
    },
  ]);
});
it("retains overdue schedules and batch sizes", () => {
  expect(
    upcomingForType(type, [cron({ next_run: 1, batchSize: 5 })])[0],
  ).toMatchObject({ nextRun: 1, batchSize: 5 });
});
it("merges all source engines, reads each type's own scope, and sorts earliest first", async () => {
  const news: ContentType = { ...type, id: 2, name: "Berita", engine: "news" };
  const quote: ContentType = { ...type, id: 4, name: "Quote", engine: "quote" };
  vi.spyOn(ContentTypeStore.prototype, "list").mockResolvedValue([
    type,
    news,
    quote,
  ]);
  const bookCrons = vi.fn(async () => {
    expect([3, 4]).toContain(currentContentType()?.id);
    return [cron({ next_run: currentContentType()?.id === 3 ? 300 : 200 })];
  });
  vi.spyOn(NewsCronStore.prototype, "list").mockImplementation(async function (
    this: NewsCronStore,
  ) {
    expect(this.typeId).toBe(2);
    expect(currentContentType()?.id).toBe(2);
    return [
      { ...cron({ next_run: 100, batchSize: 3 }), kind: "ARTICLE" as const },
    ];
  });
  const store = { db: {}, bookCrons } as unknown as Store;
  expect(
    (await listUpcomingCrons(store)).map((c) => [
      c.contentType,
      c.nextRun,
      c.batchSize,
    ]),
  ).toEqual([
    ["Berita", 100, 3],
    ["Quote", 200, 1],
    ["Literasi", 300, 1],
  ]);
  expect(currentContentType()).toBeUndefined();
});
