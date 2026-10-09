import {
  ContentTypeStore,
  currentContentType,
  withContentType,
  contentAllows,
} from "./content-types";
import type mysql from "mysql2/promise";
import {
  NEWS_CRON_TYPES,
  type NewsCronKind,
  newsKinds,
  newsStageDone,
  newsPrerequisite,
} from "./news-production-domain";
import { normalizeCron, type BookCron } from "./cron";
import { NewsMediaStore } from "./news-media-store";
import { NewsStore } from "./news-store";

export class NewsCronStore {
  constructor(
    readonly db: mysql.Pool,
    readonly typeId = currentContentType()?.id,
  ) {}
  get category() {
    return !this.typeId || this.typeId === 2
      ? "teknologi"
      : `type-${this.typeId}`;
  }
  async list(): Promise<BookCron<NewsCronKind>[]> {
    const [rows]: any = await this.db.query(
      "SELECT * FROM news_cron WHERE category=?",
      [this.category],
    );
    return NEWS_CRON_TYPES.map(([kind]) => {
      const r = rows.find((r: any) => r.kind === kind);
      return {
        book: "Teknologi",
        kind,
        enabled: !!r?.enabled,
        intervalHours: r?.interval_hours ?? 24,
        next_run: r?.next_run ?? null,
        last_tick: r?.last_tick ?? null,
        last_result: r?.last_result ?? null,
      };
    });
  }
  async save(input: unknown, now = Date.now()) {
    const kind = (input as { kind?: unknown } | null)?.kind;
    if (!NEWS_CRON_TYPES.some(([k]) => k === kind))
      throw Error("Jenis cron berita tidak dikenal");
    const v = normalizeCron(
      input,
      NEWS_CRON_TYPES.map(([k]) => k),
    );
    await this.db.query(
      "INSERT INTO news_cron(category,kind,enabled,interval_hours,next_run) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),interval_hours=VALUES(interval_hours),next_run=VALUES(next_run)",
      [
        this.category,
        v.kind,
        v.enabled ? 1 : 0,
        v.intervalHours,
        v.enabled ? now + v.intervalHours * 3600000 : null,
      ],
    );
    return this.list();
  }
  async schedule(now = Date.now()): Promise<void> {
    if (!this.typeId) {
      for (const type of await new ContentTypeStore(this.db).list()) {
        if (type.engine === "news")
          await withContentType(type, () =>
            new NewsCronStore(this.db, type.id).schedule(now),
          );
      }
      return;
    }
    const type = await new ContentTypeStore(this.db).get(this.typeId);
    if (currentContentType()?.id !== this.typeId)
      return withContentType(type, () => this.schedule(now));
    const news = new NewsStore(this.db),
      media = new NewsMediaStore(this.db);
    for (const cron of await this.list()) {
      if (
        !contentAllows(type, cron.kind) ||
        !cron.enabled ||
        cron.next_run === null ||
        cron.next_run > now
      )
        continue;
      const [lock]: any = await this.db.query(
        "UPDATE news_cron SET next_run=?,last_tick=? WHERE category=? AND kind=? AND enabled=1 AND next_run<=?",
        [
          now + cron.intervalHours * 3600000,
          now,
          this.category,
          cron.kind,
          now,
        ],
      );
      if (!lock.affectedRows) continue;
      let message = "Belum ada berita yang memenuhi prasyarat";
      try {
        const articles = await news.list();
        if (cron.kind === "ARTICLE") {
          if (!articles.some((n) => ["queued", "running"].includes(n.state))) {
            await news.create();
            message = "Pencarian artikel baru masuk antrean";
          } else message = "Artikel masih dalam proses";
        } else {
          const settings = await media.settings();
          for (const n of [...articles].reverse()) {
            if (n.state !== "completed") continue;
            const p = await media.detail(n.id, n.attempts);
            if (p.jobs.some((j) => ["queued", "running"].includes(j.state)))
              continue;
            if (newsStageDone(cron.kind, p, settings, n.article)) continue;
            if (
              ["POST_IG", "REELS_IG"].includes(cron.kind) &&
              p.outputs[cron.kind]?.status &&
              p.outputs[cron.kind].status !== "failed"
            )
              continue;
            const kinds = newsKinds(cron.kind, settings);
            if (
              !kinds.length ||
              kinds.some((k) => newsPrerequisite(k, p, settings, n.article))
            )
              continue;
            const ids = await media.enqueueMany(n.id, kinds);
            message = `Berita #${n.id}: ${ids.length} job masuk antrean`;
            break;
          }
        }
      } catch (e) {
        message = (e as Error).message;
      }
      await this.db.query(
        "UPDATE news_cron SET last_result=? WHERE category=? AND kind=? AND last_tick=?",
        [message, this.category, cron.kind, now],
      );
    }
  }
}
