import { youtubePublishInput } from "./youtube-publish";
import { normalizeTikTokSettings } from "./tiktok-settings";
import { tiktokPublishInput } from "./tiktok-publish";
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
import { type BookCron } from "./cron";
import { cronNextRun } from "./cron-schedule";
import { decodeCron, saveCronRecord, deleteCronRecord } from "./cron-records";
import { NewsMediaStore } from "./news-media-store";
import { NewsStore } from "./news-store";
import { NewsLabStore } from "./news-lab";

export class NewsCronStore {
  constructor(
    readonly db: mysql.Pool,
    readonly typeId = currentContentType()?.id,
    readonly publishTikTok?: (
      source: string,
      platform?: "youtube" | "tiktok",
    ) => Promise<{ status: string }>,
  ) {}
  get category() {
    return !this.typeId || this.typeId === 2
      ? "teknologi"
      : `type-${this.typeId}`;
  }
  private scope() {
    return {
      table: "news_cron" as const,
      where: "category=?",
      params: [this.category],
    };
  }
  async list(): Promise<BookCron<NewsCronKind>[]> {
    const [rows]: any = await this.db.query(
      "SELECT * FROM news_cron WHERE category=? ORDER BY next_run,schedule_id",
      [this.category],
    );
    return rows.map((row: any) =>
      decodeCron(row, currentContentType()?.name || "Berita"),
    );
  }
  async save(input: unknown, now = Date.now()) {
    await saveCronRecord(
      this.db,
      this.scope(),
      input,
      NEWS_CRON_TYPES.map(([kind]) => kind),
      now,
    );
    return this.list();
  }
  async remove(id: unknown) {
    await deleteCronRecord(this.db, this.scope(), id);
    return this.list();
  }
  async schedule(now = Date.now()): Promise<void> {
    if (!this.typeId) {
      for (const type of await new ContentTypeStore(this.db).list()) {
        if (type.engine === "news")
          await withContentType(type, () =>
            new NewsCronStore(this.db, type.id, this.publishTikTok).schedule(
              now,
            ),
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
        "UPDATE news_cron SET next_run=?,last_tick=? WHERE category=? AND kind=? AND enabled=1 AND next_run<=? AND schedule_id=?",
        [
          cronNextRun(cron, now),
          now,
          this.category,
          cron.kind,
          now,
          cron.id ?? "",
        ],
      );
      if (!lock.affectedRows) continue;
      let message = "Belum ada berita yang memenuhi prasyarat";
      try {
        const articles = await news.list();
        let processed = 0;
        const batchSize = 1;
        const lab =
          type.settings?.articleConfig?.source === "lab"
            ? type.settings.articleConfig.labId!
            : null;
        if (cron.kind === "ARTICLE") {
          if (lab && !(await new NewsLabStore(this.db).pending(lab)))
            message = "Belum ada berita pilihan Jurnalis di Lab Berita";
          else if (
            !articles.some((n) => ["queued", "running"].includes(n.state))
          ) {
            for (let i = 0; i < batchSize; i++) await news.create();
            message = `${batchSize} artikel baru masuk antrean`;
          } else message = "Artikel masih dalam proses";
        } else if (["POST_TIKTOK", "POST_YOUTUBE"].includes(cron.kind)) {
          const settings = await media.settings();
          const options = normalizeTikTokSettings(settings.tiktok);
          const youtube = cron.kind === "POST_YOUTUBE";
          const platform = youtube ? "youtube" : "tiktok";
          if (youtube)
            options.media = youtubePublishInput(
              "book:1",
              "",
              settings,
            ).mediaKey.endsWith(":h")
              ? "h"
              : "v";
          if (
            youtube
              ? !settings.youtubeAccountId
              : !settings.tiktokAccountId || !options.privacy
          )
            throw Error(
              youtube
                ? "Pilih akun YouTube di Pengaturan Konten"
                : "Lengkapi akun dan privasi TikTok di Pengaturan Konten",
            );
          if (!this.publishTikTok)
            throw Error("Worker publikasi sosmed belum tersedia");
          const kind =
            options.media === "photo"
              ? "PANEL"
              : options.media === "h"
                ? "VIDEO_KALIMAT_H"
                : "VIDEO_KALIMAT";
          for (const n of [...articles].reverse()) {
            if (n.state !== "completed") continue;
            const p = await media.detail(n.id, n.attempts);
            if (
              !p.outputs[kind] ||
              p.jobs.some((j) => ["queued", "running"].includes(j.state))
            )
              continue;
            const source = `news:${n.id}`;
            const input = youtube
              ? youtubePublishInput(source, n.title, settings)
              : tiktokPublishInput(source, n.article, n.title, settings);
            const [previous]: any = await this.db.query(
              "SELECT id FROM zernio_publications WHERE source_key=? AND platform=? AND account_id=? LIMIT 1",
              [input.mediaKey, platform, input.accountId],
            );
            if (previous.length) continue;
            const result = await this.publishTikTok(
              source,
              ...(youtube ? ["youtube" as const] : []),
            );
            processed++;
            message = `${processed} artikel: ${youtube ? "YouTube" : "TikTok"} ${result.status}`;
            if (processed >= batchSize) break;
          }
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
            processed++;
            message = `${processed} artikel: ${cron.kind} masuk antrean`;
            if (processed >= batchSize) break;
          }
        }
      } catch (e) {
        message = (e as Error).message;
      }
      await this.db.query(
        "UPDATE news_cron SET last_result=? WHERE category=? AND kind=? AND last_tick=? AND schedule_id=?",
        [message, this.category, cron.kind, now, cron.id ?? ""],
      );
    }
  }
}
