import { ContentTypeStore, withContentType } from "./content-types";
import { nextBookJob, nextNewsJob } from "./content-plan";
import type { Store } from "./store";
import { NewsMediaStore } from "./news-media-store";
import { NewsStore } from "./news-store";

export async function scheduleProduction(store: Store, limit = 12) {
  const connection = await store.db.getConnection();
  let locked = false;
  try {
    const [rows]: any = await connection.query(
      "SELECT GET_LOCK('ncpost-auto-production',0) AS acquired",
    );
    locked = rows[0].acquired === 1;
    if (!locked) return;
    for (const type of await new ContentTypeStore(store.db).list()) {
      if (!type.settings?.managed || !type.settings.autoProcess) continue;
      await withContentType(type, async () => {
        const settings = type.settings!;
        if (type.engine === "book") {
          for (const chapter of await store.list()) {
            if (limit <= 0) break;
            if (
              !nextBookJob(
                type,
                chapter,
                settings,
                chapter.production_jobs || [],
              )
            )
              continue;
            // Lock the content row to serialize automatic and manual enqueue.
            await connection.beginTransaction();
            try {
              const [current]: any = await connection.query(
                "SELECT * FROM chapters WHERE id=? FOR UPDATE",
                [chapter.id],
              );
              if (!current[0]) {
                await connection.commit();
                continue;
              }
              const [attempts]: any = await connection.query(
                "SELECT kind,state FROM jobs WHERE chapter_id=? AND revision=? ORDER BY id DESC",
                [chapter.id, current[0].revision],
              );
              const [counts]: any = await connection.query(
                "SELECT kind,COUNT(*) AS n FROM chapter_stock WHERE chapter_id=? GROUP BY kind",
                [chapter.id],
              );
              const kind = nextBookJob(
                type,
                {
                  ...current[0],
                  stock_counts: Object.fromEntries(
                    counts.map((row: any) => [row.kind, Number(row.n)]),
                  ),
                },
                settings,
                attempts,
              );
              if (kind) {
                await store.enqueue(chapter.id, kind, false, connection);
                limit--;
              }
              await connection.commit();
            } catch (e) {
              await connection.rollback();
              console.error(
                `Produksi bagian #${chapter.id}:`,
                (e as Error).message,
              );
            }
          }
        } else {
          const news = new NewsStore(store.db),
            media = new NewsMediaStore(store.db);
          for (const article of await news.list()) {
            if (limit <= 0) break;
            if (article.state !== "completed") continue;
            const production = await media.detail(article.id, article.attempts);
            const kind = nextNewsJob(
              type,
              article.article,
              settings,
              production,
            );
            if (kind) {
              try {
                await media.enqueue(article.id, kind);
                limit--;
              } catch (e) {
                console.error(
                  `Produksi berita #${article.id}:`,
                  (e as Error).message,
                );
              }
            }
          }
        }
      });
      if (limit <= 0) break;
    }
  } finally {
    if (locked)
      await connection
        .query("SELECT RELEASE_LOCK('ncpost-auto-production')")
        .catch(() => {});
    connection.release();
  }
}
