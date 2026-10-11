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
  id?: string;
  contentTypeId: number;
  contentType: string;
  kind: string;
  label: string;
  batchSize: number;
  nextRun: number | null;
  cron?: BookCron<string>;
  engine?: ContentType["engine"];
  available?: boolean;
}
const labels: Record<string, string> = Object.fromEntries([
  ...CRON_TYPES,
  ...NEWS_CRON_TYPES,
]);
export function upcomingForType(
  type: ContentType,
  crons: BookCron<string>[],
  all = false,
): UpcomingCron[] {
  return crons
    .filter(
      (c) =>
        all ||
        (c.enabled &&
          c.next_run !== null &&
          Number.isFinite(Number(c.next_run)) &&
          contentAllows(type, c.kind)),
    )
    .map((c) => ({
      ...(c.id ? { id: c.id } : {}),
      contentTypeId: type.id,
      contentType: type.name,
      kind: c.kind,
      label: labels[c.kind] || c.kind,
      batchSize: 1,
      nextRun:
        c.next_run === null || !Number.isFinite(Number(c.next_run))
          ? null
          : Number(c.next_run),
      ...(all
        ? {
            cron: c,
            engine: type.engine,
            available: contentAllows(type, c.kind),
          }
        : {}),
    }));
}
export async function listUpcomingCrons(store: Store, all = false) {
  const types = await new ContentTypeStore(store.db).list();
  const schedules: UpcomingCron[] = [];
  for (const type of types) {
    const crons = await withContentType(type, () =>
      type.engine === "news"
        ? new NewsCronStore(store.db, type.id).list()
        : store.bookCrons(),
    );
    schedules.push(...upcomingForType(type, crons, all));
  }
  return schedules.sort(
    (a, b) =>
      (a.nextRun ?? Infinity) - (b.nextRun ?? Infinity) ||
      a.contentTypeId - b.contentTypeId ||
      a.kind.localeCompare(b.kind),
  );
}
