// Ringkasan untuk halaman Kantor: target posting harian per jenis konten
// (diatur di Pengaturan Konten) yang dikerjakan Manajer, dan semua posting
// sosmed terbaru. Hari dihitung dalam WIB (UTC+7), sama seperti jadwal cron.
import type mysql from "mysql2/promise";
import { socialTargets } from "./book-settings";
import { ContentTypeStore } from "./content-types";
import { loadManager, managerView, type ManagerState } from "./manager";
import {
  activeTargets,
  managerTargets,
  type TargetMap,
} from "./manager-targets";

export const OFFICE_PLATFORMS = ["instagram", "tiktok", "youtube"] as const;
export type OfficePlatform = (typeof OFFICE_PLATFORMS)[number];
export type PlatformCounts = Record<OfficePlatform, number>;
const WIB = 7 * 3600000;
const DAY = 86400000;
// Status Zernio yang tidak dihitung sebagai posting terkirim.
const NOT_SENT = [
  "failed",
  "error",
  "unknown",
  "submitting",
  "cancelled",
  "canceled",
];

export const emptyCounts = (): PlatformCounts => ({
  instagram: 0,
  tiktok: 0,
  youtube: 0,
});
/** Awal hari WIB (epoch ms) untuk waktu `now`. */
export const wibDayStart = (now: number) =>
  Math.floor((now + WIB) / DAY) * DAY - WIB;
/** Tanggal WIB "YYYY-MM-DD". */
export const wibDate = (ts: number) =>
  new Date(ts + WIB).toISOString().slice(0, 10);
export const sentStatus = (status: string) =>
  !NOT_SENT.includes(String(status).toLowerCase());
/** Sumber publikasi Zernio: "book:<bagian>:v" atau "news:<artikel>…". */
export function sourceRef(sourceKey: string) {
  const m = /^(book|news):(\d+)/.exec(sourceKey || "");
  return m ? { kind: m[1] as "book" | "news", id: Number(m[2]) } : null;
}

type PostEvent = {
  platform: OfficePlatform;
  typeId: number | null;
  kind: string;
  title: string;
  status: string;
  sent: boolean;
  at: number;
  byManager: boolean;
};

async function query<T = any>(
  db: mysql.Pool,
  sql: string,
  params: unknown[] = [],
) {
  try {
    const [rows] = await db.query(sql, params);
    return rows as T[];
  } catch {
    // Tabel opsional (mis. berita) yang belum dimigrasi tidak menggagalkan ringkasan.
    return [] as T[];
  }
}

export async function officeSummary(
  db: mysql.Pool,
  now = Date.now(),
  manager: ManagerState = loadManager(),
  targetMap?: TargetMap,
) {
  const targets = targetMap ?? (await managerTargets(db));
  const today = wibDayStart(now);
  const since = new Date(today - 6 * DAY);
  const igKinds = ["POST_IG", "REELS_IG"];
  const managerJobs = new Set(
    manager.posts.filter((p) => p.jobId).map((p) => p.jobId),
  );
  const managerSources = new Set(
    manager.posts
      .filter((p) => p.source)
      .map((p) => `${p.platform}|${p.source}`),
  );
  const [bookIg, newsIg, zernio] = await Promise.all([
    query(
      db,
      "SELECT j.id,j.kind,j.state,j.created_at,c.title,c.content_type_id FROM jobs j LEFT JOIN chapters c ON c.id=j.chapter_id WHERE j.kind IN (?) AND j.state IN ('completed','failed') AND j.created_at>=? ORDER BY j.id DESC",
      [igKinds, since],
    ),
    query(
      db,
      "SELECT j.kind,j.state,j.created_at,n.title,n.content_type_id FROM news_media_jobs j LEFT JOIN news_articles n ON n.id=j.news_id WHERE j.kind IN (?) AND j.state IN ('completed','failed') AND j.created_at>=? ORDER BY j.id DESC",
      [igKinds, since],
    ),
    query(
      db,
      "SELECT source_key,platform,status,title,created_at FROM zernio_publications WHERE created_at>=? ORDER BY id DESC",
      [since],
    ),
  ]);
  // Jenis konten publikasi Zernio diambil dari bagian/artikel sumbernya.
  const refs = zernio.map((r: any) => sourceRef(r.source_key));
  const ids = (kind: string) => [
    ...new Set(refs.filter((r) => r?.kind === kind).map((r) => r!.id)),
  ];
  const [chapterTypes, newsTypes] = await Promise.all([
    ids("book").length
      ? query(db, "SELECT id,content_type_id FROM chapters WHERE id IN (?)", [
          ids("book"),
        ])
      : [],
    ids("news").length
      ? query(
          db,
          "SELECT id,content_type_id FROM news_articles WHERE id IN (?)",
          [ids("news")],
        )
      : [],
  ]);
  const typeOf = new Map<string, number>([
    ...chapterTypes.map(
      (r: any) =>
        [`book:${r.id}`, Number(r.content_type_id)] as [string, number],
    ),
    ...newsTypes.map(
      (r: any) =>
        [`news:${r.id}`, Number(r.content_type_id)] as [string, number],
    ),
  ]);
  const events: PostEvent[] = [
    ...[...bookIg, ...newsIg].map((r: any) => ({
      platform: "instagram" as const,
      typeId: r.content_type_id == null ? null : Number(r.content_type_id),
      kind: r.kind === "REELS_IG" ? "Reels" : "Carousel",
      title: r.title || "Tanpa judul",
      status: r.state === "completed" ? "terbit" : "gagal",
      sent: r.state === "completed",
      at: new Date(r.created_at).getTime(),
      byManager: r.id != null && managerJobs.has(Number(r.id)),
    })),
    ...zernio
      .map((r: any, i) => ({ r, ref: refs[i] }))
      .filter(({ r }) => r.platform === "tiktok" || r.platform === "youtube")
      .map(({ r, ref }) => ({
        platform: r.platform as OfficePlatform,
        typeId: ref ? (typeOf.get(`${ref.kind}:${ref.id}`) ?? null) : null,
        kind: r.platform === "youtube" ? "Video" : "Post",
        title: r.title || "Tanpa judul",
        status: String(r.status),
        sent: sentStatus(r.status),
        at: new Date(r.created_at).getTime(),
        byManager:
          !!ref && managerSources.has(`${r.platform}|${ref.kind}:${ref.id}`),
      })),
  ].sort((a, b) => b.at - a.at);

  // Semua posting hari ini (Manajer + jadwal manual), hanya sebagai informasi.
  const todayAll = emptyCounts();
  for (const e of events) if (e.sent && e.at >= today) todayAll[e.platform]++;
  // Riwayat 7 hari posting Manajer (yang dihitung ke target).
  const history = Array.from({ length: 7 }, (_, i) => ({
    date: wibDate(today - (6 - i) * DAY),
    ...emptyCounts(),
  }));
  for (const p of manager.posts) {
    if (p.status !== "terbit") continue;
    const day = history.find((h) => h.date === wibDate(p.at));
    if (day) day[p.platform]++;
  }

  const contentTypes = await new ContentTypeStore(db).list().catch(() => []);
  const list = contentTypes.map((t) => {
    const view = managerView(manager, t, targets, now);
    const pick = (f: (v: (typeof view)["instagram"]) => number) =>
      Object.fromEntries(
        OFFICE_PLATFORMS.map((p) => [p, f(view[p])]),
      ) as PlatformCounts;
    return {
      id: t.id,
      name: t.name,
      engine: t.engine,
      // Sosmed yang aktif di Rencana konten sosmed (dibaca, tidak diubah).
      active: socialTargets(t.settings),
      targets: activeTargets(targets, t) as PlatformCounts,
      today: pick((v) => v.done),
      inflight: pick((v) => v.inflight),
      failed: pick((v) => v.failed),
      manager: view,
    };
  });
  const sum = (key: "targets" | "today") =>
    list.reduce((acc, t) => {
      for (const p of OFFICE_PLATFORMS) acc[p] += t[key][p];
      return acc;
    }, emptyCounts());
  // Capaian per jenis: kelebihan di satu jenis tidak menutupi kekurangan jenis lain.
  const progress = list.reduce((acc, t) => {
    for (const p of OFFICE_PLATFORMS)
      acc[p] += Math.min(t.today[p], t.targets[p]);
    return acc;
  }, emptyCounts());
  const next = Object.fromEntries(
    OFFICE_PLATFORMS.map((p) => {
      const times = list
        .filter((t) => t.targets[p] > t.today[p])
        .map((t) => t.manager[p].next)
        .filter((x): x is number => x != null);
      return [p, times.length ? Math.min(...times) : null];
    }),
  ) as Record<OfficePlatform, number | null>;
  const typeName = new Map(list.map((t) => [t.id, t.name]));
  return {
    date: wibDate(now),
    types: list,
    targets: sum("targets"),
    progress,
    today: sum("today"),
    todayAll,
    next,
    history,
    manager: {
      lastActionAt: manager.lastActionAt,
      orders: manager.orders
        .filter((o) => o.status === "berjalan" || o.updated >= today)
        .map((o) => ({ ...o, typeName: typeName.get(o.typeId) ?? null })),
      log: manager.log.slice(0, 30).map((l) => ({
        ...l,
        typeName: l.typeId == null ? null : (typeName.get(l.typeId) ?? null),
      })),
    },
    recent: events.slice(0, 12).map((e) => ({
      ...e,
      typeName: e.typeId == null ? null : (typeName.get(e.typeId) ?? null),
    })),
  };
}
