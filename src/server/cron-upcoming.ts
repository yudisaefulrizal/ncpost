import type { Store } from "./store";
import {
  ContentTypeStore,
  withContentType,
  contentAllows,
} from "./content-types";
import type { ContentType } from "./content-type-domain";
import { NewsCronStore } from "./news-cron";
import { CRON_TYPES, type BookCron } from "./cron";
import { NEWS_CRON_TYPES } from "./news-production-domain";
export interface UpcomingCron {
  contentTypeId: number;
  contentType: string;
  kind: string;
  label: string;
  batchSize: number;
  nextRun: number;
}
const labels: Record<string, string> = Object.fromEntries([
  ...CRON_TYPES,
  ...NEWS_CRON_TYPES,
]);
export function upcomingForType(
  type: ContentType,
  crons: BookCron<string>[],
): UpcomingCron[] {
  return crons
    .filter(
      (c) =>
        c.enabled &&
        c.next_run !== null &&
        Number.isFinite(Number(c.next_run)) &&
        contentAllows(type, c.kind),
    )
    .map((c) => ({
      contentTypeId: type.id,
      contentType: type.name,
      kind: c.kind,
      label: labels[c.kind] || c.kind,
      batchSize: c.batchSize ?? 1,
      nextRun: Number(c.next_run),
    }));
}
export async function listUpcomingCrons(store: Store) {
  const types = await new ContentTypeStore(store.db).list();
  const schedules: UpcomingCron[] = [];
  for (const type of types) {
    const crons = await withContentType(type, () =>
      type.engine === "news"
        ? new NewsCronStore(store.db, type.id).list()
        : store.bookCrons(),
    );
    schedules.push(...upcomingForType(type, crons));
  }
  return schedules.sort(
    (a, b) =>
      a.nextRun - b.nextRun ||
      a.contentTypeId - b.contentTypeId ||
      a.kind.localeCompare(b.kind),
  );
}
