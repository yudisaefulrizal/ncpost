// Manajer: menjalankan target posting harian per jenis konten (diatur di
// Pengaturan Konten). Ia menyusun jam posting sendiri, memposting konten siap
// sesuai Rencana konten sosmed, mengevaluasi hasilnya, dan memerintahkan tim
// memproduksi topik berikutnya bila stok konten siap kurang. Terpisah dari menu
// Jadwal (manual): posting dari jadwal manual tidak dihitung ke target Manajer.
// Catatan Manajer disimpan di data/manager.json (tanpa perubahan skema DB).
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { ROOT } from "./config";
import { type BookSettings, type SocialTarget } from "./book-settings";
import {
  activeTargets,
  managerTargets,
  targetsFile,
  type TargetMap,
} from "./manager-targets";
import { ContentTypeStore, withContentType } from "./content-types";
import type { ContentType } from "./content-type-domain";
import { nextBookJob } from "./content-plan";
import { NEEDS_OUTPUT, instagramFormats, socialPlan } from "./social-plan";
import { normalizeTikTokSettings } from "./tiktok-settings";
import { tiktokPublishInput } from "./tiktok-publish";
import { youtubePublishInput } from "./youtube-publish";
import type { Chapter, Store } from "./store";

export type Platform = SocialTarget;
export const PLATFORMS: Platform[] = ["instagram", "tiktok", "youtube"];
const WIB = 7 * 3600000;
const DAY = 86400000;
const MINUTE = 60000;
// Jendela posting yang dipilih Manajer (menit sejak 00.00 WIB).
export const POST_WINDOW = { start: 6 * 60, end: 22 * 60 };
export const MIN_GAP = 15 * MINUTE; // jarak minimum antarposting satu sosmed/jenis
export const MAX_FAILS = 5; // per sosmed/jenis per hari, lalu berhenti
const MAX_ORDERS = 2; // topik yang diproduksi bersamaan per jenis konten

export type PostStatus = "proses" | "terbit" | "gagal";
export type ManagerPost = {
  at: number;
  typeId: number;
  platform: Platform;
  chapterId: number;
  title: string;
  kind: string;
  jobId?: number;
  source?: string;
  status: PostStatus;
  note?: string;
};
export type ManagerOrder = {
  at: number;
  updated: number;
  typeId: number;
  chapterId: number;
  title: string;
  reason: string;
  status: "berjalan" | "selesai" | "macet";
  note?: string;
};
export type ManagerLog = {
  at: number;
  typeId?: number;
  text: string;
  tone: "info" | "ok" | "warn";
};
export type ManagerState = {
  posts: ManagerPost[];
  orders: ManagerOrder[];
  log: ManagerLog[];
  lastActionAt: number;
  // Stok konten siap per "jenis:sosmed" pada evaluasi terakhir.
  stock: Record<string, { ready: number; at: number }>;
  noted: Record<string, number>;
};
export const emptyState = (): ManagerState => ({
  posts: [],
  orders: [],
  log: [],
  lastActionAt: 0,
  stock: {},
  noted: {},
});

// ---------- penyimpanan ----------
const stateFile = () => path.join(ROOT, "data", "manager.json");
export function loadManager(file = stateFile()): ManagerState {
  try {
    if (!existsSync(file)) return emptyState();
    return { ...emptyState(), ...JSON.parse(readFileSync(file, "utf8")) };
  } catch {
    return emptyState();
  }
}
function saveManager(state: ManagerState, file = stateFile()) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + ".tmp";
  writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
  renameSync(tmp, file);
}

// ---------- jadwal ----------
export const wibDayStart = (now: number) =>
  Math.floor((now + WIB) / DAY) * DAY - WIB;
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
/** Jam posting hari itu: target dibagi rata di jendela posting, sedikit diacak per hari. */
export function slotTimes(target: number, dayStart: number, seed: string) {
  const len = POST_WINDOW.end - POST_WINDOW.start;
  const step = len / Math.max(1, target);
  return Array.from({ length: target }, (_, i) => {
    const jitter = Math.max(
      -20,
      Math.min(20, (hash(seed + i) - 0.5) * step * 0.5),
    );
    return dayStart + (POST_WINDOW.start + (i + 0.5) * step + jitter) * MINUTE;
  });
}
export const dueCount = (slots: number[], now: number) =>
  slots.filter((t) => t <= now).length;
export type SlotView = {
  at: number;
  status: PostStatus | "terjadwal" | "terlewat";
};
/** Jadwal hari ini beserta hasilnya: posting ke-i mengisi jam ke-i. */
export function scheduleView(
  slots: number[],
  posts: Pick<ManagerPost, "at" | "status">[],
  now: number,
): SlotView[] {
  const done = [...posts].sort((a, b) => a.at - b.at);
  const ok = done.filter((p) => p.status !== "gagal");
  return slots.map((at, i) => ({
    at,
    status: ok[i]?.status ?? (at <= now ? "terlewat" : "terjadwal"),
  }));
}

// ---------- checklist ketersediaan ----------
export type CheckStatus = "siap" | "diproduksi" | "kurang";
export type CheckRow = {
  need: number;
  ready: number;
  producing: number;
  status: CheckStatus;
};
/**
 * Persiapan stok: sisa target hari ini lalu target besok harus sudah siap.
 * Topik yang sedang diproduksi menutup kekurangan hari ini lebih dulu.
 */
export function availability(
  ready: number,
  target: number,
  done: number,
  inflight: number,
  producing: number,
) {
  const row = (need: number, have: number, prod: number): CheckRow => {
    const short = need - have;
    return {
      need,
      ready: have,
      producing: prod,
      status: short <= 0 ? "siap" : prod >= short ? "diproduksi" : "kurang",
    };
  };
  const needToday = Math.max(0, target - done - inflight);
  const readyToday = Math.min(ready, needToday);
  const readyTomorrow = Math.min(Math.max(0, ready - needToday), target);
  const coverToday = Math.min(producing, needToday - readyToday);
  const coverTomorrow = Math.min(
    producing - coverToday,
    target - readyTomorrow,
  );
  return {
    today: row(needToday, readyToday, coverToday),
    tomorrow: row(target, readyTomorrow, coverTomorrow),
    short: needToday - readyToday + (target - readyTomorrow),
  };
}

// ---------- kesiapan konten ----------
const activeJob = (c: Chapter, kind: string) =>
  (c.production_jobs || []).some(
    (j) => j.kind === kind && ["queued", "running"].includes(j.state),
  );
const busy = (c: Chapter) =>
  (c.production_jobs || []).some((j) =>
    ["queued", "running"].includes(j.state),
  );
export function igReady(c: Chapter, format: "carousel" | "reels") {
  if (c.article_status !== "siap") return false;
  return format === "carousel"
    ? !!c.panels &&
        c.panel_status === "tersedia" &&
        c.post_status === "belum" &&
        !activeJob(c, "POST_IG")
    : !!c.sentence_video &&
        c.reels_status === "belum" &&
        !activeJob(c, "REELS_IG");
}
function panelFiles(c: Chapter) {
  try {
    const manifest = JSON.parse(c.panels || "{}");
    return [
      ...(manifest.panels || []).map((p: any) => p.file),
      manifest.closing,
    ].filter((f) => typeof f === "string").length;
  } catch {
    return 0;
  }
}
/** Input publikasi Zernio bila topik siap untuk sosmed itu, selain itu null. */
export function zernioInput(
  c: Chapter & { content_engine?: string },
  platform: "tiktok" | "youtube",
  settings: BookSettings,
) {
  if (c.article_status !== "siap" || busy(c)) return null;
  const source = `book:${c.id}`;
  try {
    if (platform === "youtube") {
      const input = youtubePublishInput(source, c.title, settings);
      const ready = input.mediaKey.endsWith(":h")
        ? c.sentence_video_h
        : c.sentence_video;
      return ready
        ? { source, mediaKey: input.mediaKey, accountId: input.accountId }
        : null;
    }
    const options = normalizeTikTokSettings(settings.tiktok);
    if (!settings.tiktokAccountId || !options.privacy) return null;
    const ready =
      options.media === "photo"
        ? c.panels &&
          c.panel_status === "tersedia" &&
          panelFiles(c) >= 2 &&
          panelFiles(c) <= 35
        : options.media === "h"
          ? c.sentence_video_h
          : c.sentence_video;
    if (!ready) return null;
    const input = tiktokPublishInput(
      source,
      c.article,
      c.title,
      settings,
      c.content_engine as any,
    );
    return { source, mediaKey: input.mediaKey, accountId: input.accountId };
  } catch {
    return null;
  }
}

const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};
const STAFF_FOR: Record<string, string> = {
  ARTICLE: "Tim Produksi",
  EDITOR: "Tim Produksi",
  PREVIEW: "Tim Produksi",
  QUOTE: "Tim Produksi",
  TTS_KALIMAT: "Pustakawan Audio",
  PANEL: "Staf Gudang Panel",
  IMAGES_PANEL: "Pustakawan Foto",
  VIDEO_KALIMAT: "Staf Gudang Video",
  VIDEO_KALIMAT_H: "Staf Gudang Video",
  IMAGES_VIDEO: "Pustakawan Foto",
  QUOTE_IMAGE: "Staf Gudang Gambar",
  POST_IMAGE: "Staf Gudang Gambar",
};
const staffFor = (kind: string) =>
  STAFF_FOR[kind] ?? (/IMAGE/.test(kind) ? "Pustakawan Foto" : "tim");
const TASK_LABEL: Record<string, string> = {
  ARTICLE: "menulis artikel",
  EDITOR: "meninjau artikel",
  PREVIEW: "menyiapkan pratinjau",
  QUOTE: "menulis quote",
  QUOTE_IMAGE: "membuat gambar quote",
  POST_IMAGE: "membuat gambar tunggal",
  TTS_KALIMAT: "membuat narasi suara",
  PANEL: "menyusun carousel",
  VIDEO_KALIMAT: "merender video vertikal",
  VIDEO_KALIMAT_H: "merender video horizontal",
};
export const taskFor = (kind: string) =>
  TASK_LABEL[kind] ??
  (kind.startsWith("S_")
    ? "membuat gambar untuk video"
    : /IMAGE/.test(kind)
      ? "membuat gambar carousel"
      : kind);
// Nomor bagian berlaku per buku, jadi nama bukunya ikut disebut.
const partLabel = (c: Chapter) =>
  `${c.book ? c.book.slice(0, 40) + " · " : ""}bagian ${c.part_number ?? c.id}${c.title ? ` (${c.title.slice(0, 50)})` : ""}`;

// ---------- satu putaran kerja ----------
type Publish = (
  source: string,
  platform?: "youtube" | "tiktok",
) => Promise<{ status: string }>;

export async function managerTick(
  store: Store,
  publish: Publish,
  now = Date.now(),
  file = stateFile(),
  targetFile = targetsFile(),
) {
  // Hanya satu proses yang boleh menjalankan Manajer pada satu waktu.
  const connection = await store.db.getConnection();
  try {
    const [rows]: any = await connection.query(
      "SELECT GET_LOCK('ncpost-manager',0) AS acquired",
    );
    if (rows[0]?.acquired !== 1) return;
    try {
      const state = loadManager(file);
      const targets = await managerTargets(store.db, targetFile);
      await work(store, publish, state, targets, now);
      saveManager(state, file);
    } finally {
      await connection.query("SELECT RELEASE_LOCK('ncpost-manager')");
    }
  } finally {
    connection.release();
  }
}

async function work(
  store: Store,
  publish: Publish,
  state: ManagerState,
  targetMap: TargetMap,
  now: number,
) {
  const today = wibDayStart(now);
  const log = (text: string, tone: ManagerLog["tone"], typeId?: number) => {
    state.log.unshift({ at: now, text, tone, typeId });
    state.log = state.log.slice(0, 200);
  };
  // Catatan berulang (mis. stok kosong) cukup sekali per selang waktu.
  const note = (
    key: string,
    text: string,
    tone: ManagerLog["tone"],
    typeId?: number,
    every = 3 * 3600000,
  ) => {
    if (now - (state.noted[key] ?? 0) < every) return;
    state.noted[key] = now;
    log(text, tone, typeId);
  };
  state.posts = state.posts.filter((p) => p.at >= today - 7 * DAY);
  state.orders = state.orders.filter(
    (o) => o.status === "berjalan" || o.updated >= now - 2 * DAY,
  );
  for (const [k, t] of Object.entries(state.noted))
    if (t < now - 2 * DAY) delete state.noted[k];

  // 1. Hasil posting Instagram yang sedang diproses.
  const pending = state.posts.filter((p) => p.status === "proses" && p.jobId);
  if (pending.length) {
    const [jobs]: any = await store.db.query(
      "SELECT id,state,error FROM jobs WHERE id IN (?)",
      [pending.map((p) => p.jobId)],
    );
    for (const p of pending) {
      const j = jobs.find((x: any) => x.id === p.jobId);
      if (!j || ["failed", "cancelled"].includes(j.state)) {
        p.status = "gagal";
        p.note = j?.error || "Job posting dibatalkan";
        log(
          `${PLATFORM_LABEL[p.platform]} ${p.kind} ${p.title} gagal: ${p.note}. Dicoba dengan konten lain.`,
          "warn",
          p.typeId,
        );
      } else if (j.state === "completed") {
        p.status = "terbit";
        log(
          `${PLATFORM_LABEL[p.platform]} ${p.kind} terbit: ${p.title}`,
          "ok",
          p.typeId,
        );
      }
    }
  }

  const types = await new ContentTypeStore(store.db).list();
  for (const type of types) {
    if (type.engine === "news" || !type.settings) continue;
    const settings = type.settings;
    const targets = activeTargets(targetMap, type);
    const hasOrders = state.orders.some(
      (o) => o.typeId === type.id && o.status === "berjalan",
    );
    if (!PLATFORMS.some((p) => targets[p] > 0) && !hasOrders) continue;
    const chapters = (await withContentType(type, () => store.list())).sort(
      (a, b) =>
        Number(a.part_number ?? a.id) - Number(b.part_number ?? b.id) ||
        a.id - b.id,
    );
    const plan = socialPlan(type.outputs, settings, type.engine);
    let shortage = 0;
    const shortFor: string[] = [];

    for (const platform of PLATFORMS) {
      const target = targets[platform];
      if (!target) continue;
      const row = plan.find((r) => r.platform === platform)!;
      if (!row.posts.length) {
        note(
          `plan:${type.id}:${platform}`,
          `${type.name} · ${PLATFORM_LABEL[platform]}: belum ada konten yang bisa diposting (${row.problems.join("; ")}). Periksa Rencana konten sosmed.`,
          "warn",
          type.id,
        );
        continue;
      }
      const mine = state.posts.filter(
        (p) => p.typeId === type.id && p.platform === platform && p.at >= today,
      );
      const done = mine.filter((p) => p.status === "terbit").length;
      const inflight = mine.filter((p) => p.status === "proses").length;
      const failed = mine.filter((p) => p.status === "gagal").length;

      // Stok konten siap untuk sosmed ini.
      const published =
        platform === "instagram"
          ? new Set<string>()
          : new Set(
              (
                (await store.db.query(
                  "SELECT source_key FROM zernio_publications WHERE platform=?",
                  [platform],
                )) as any
              )[0].map((r: any) => r.source_key as string),
            );
      const formats = instagramFormats(settings).filter((f) =>
        type.outputs.includes(NEEDS_OUTPUT[f]),
      );
      const candidates =
        platform === "instagram"
          ? formats.flatMap((format) =>
              chapters
                .filter((c) => igReady(c, format))
                .map((c) => ({ c, format })),
            )
          : chapters
              .map((c) => ({ c, input: zernioInput(c, platform, settings) }))
              .filter(({ input }) => input && !published.has(input.mediaKey));
      const readyCount =
        platform === "instagram"
          ? new Set(candidates.map((x: any) => x.c.id)).size
          : candidates.length;
      state.stock[`${type.id}:${platform}`] = { ready: readyCount, at: now };
      // Persiapan: sisa target hari ini dan target besok harus sudah siap.
      const { short } = availability(readyCount, target, done, inflight, 0);
      if (short > 0) {
        shortage = Math.max(shortage, short);
        shortFor.push(PLATFORM_LABEL[platform]);
      }

      if (done >= target) continue;
      if (failed >= MAX_FAILS) {
        note(
          `fail:${type.id}:${platform}:${today}`,
          `${type.name} · ${PLATFORM_LABEL[platform]}: ${failed} posting gagal hari ini, Manajer berhenti untuk sosmed ini sampai besok.`,
          "warn",
          type.id,
          DAY,
        );
        continue;
      }
      const slots = slotTimes(target, today, `${today}:${type.id}:${platform}`);
      const due = dueCount(slots, now);
      const last = Math.max(0, ...mine.map((p) => p.at));
      if (done + inflight >= due || now - last < MIN_GAP) continue;

      // Waktunya posting: ambil konten siap tertua.
      try {
        if (platform === "instagram") {
          const counts = (f: string) =>
            mine.filter(
              (p) => p.kind === (f === "reels" ? "Reels" : "Carousel"),
            ).length;
          const pick = [...formats]
            .sort((a, b) => counts(a) - counts(b))
            .map(
              (format) =>
                candidates.find((x: any) => x.format === format) as any,
            )
            .find(Boolean);
          if (!pick) {
            note(
              `empty:${type.id}:${platform}`,
              `${type.name} · Instagram: tidak ada konten siap untuk diposting.`,
              "warn",
              type.id,
              3600000,
            );
            continue;
          }
          const kind = pick.format === "reels" ? "REELS_IG" : "POST_IG";
          const jobId = await store.enqueue(pick.c.id, kind);
          state.posts.push({
            at: now,
            typeId: type.id,
            platform,
            chapterId: pick.c.id,
            title: pick.c.title,
            kind: pick.format === "reels" ? "Reels" : "Carousel",
            jobId: Number(jobId),
            status: "proses",
          });
          log(
            `Memposting ${pick.format === "reels" ? "Reels" : "Carousel"} ${type.name} ke Instagram: ${partLabel(pick.c)}.`,
            "info",
            type.id,
          );
        } else {
          const pick = candidates[0] as any;
          if (!pick) {
            note(
              `empty:${type.id}:${platform}`,
              `${type.name} · ${PLATFORM_LABEL[platform]}: tidak ada konten siap untuk diposting.`,
              "warn",
              type.id,
              3600000,
            );
            continue;
          }
          const post: ManagerPost = {
            at: now,
            typeId: type.id,
            platform,
            chapterId: pick.c.id,
            title: pick.c.title,
            kind: platform === "youtube" ? "Video" : "Post",
            source: pick.input.source,
            status: "proses",
          };
          state.posts.push(post);
          try {
            const result = await publish(
              pick.input.source,
              platform === "youtube" ? "youtube" : "tiktok",
            );
            const status = String(result.status || "unknown").toLowerCase();
            post.status = [
              "failed",
              "error",
              "unknown",
              "cancelled",
              "canceled",
            ].includes(status)
              ? "gagal"
              : "terbit";
            post.note = status;
            log(
              post.status === "terbit"
                ? `${PLATFORM_LABEL[platform]} ${type.name} terkirim (${status}): ${partLabel(pick.c)}.`
                : `${PLATFORM_LABEL[platform]} ${type.name} ${status === "unknown" ? "belum pasti" : "gagal"}: ${partLabel(pick.c)}. Dicoba dengan konten lain.`,
              post.status === "terbit" ? "ok" : "warn",
              type.id,
            );
          } catch (e) {
            post.status = "gagal";
            post.note = (e as Error).message;
            log(
              `${PLATFORM_LABEL[platform]} ${type.name} gagal: ${post.note}`,
              "warn",
              type.id,
            );
          }
        }
        state.lastActionAt = now;
      } catch (e) {
        log(
          `${type.name} · ${PLATFORM_LABEL[platform]}: ${(e as Error).message}`,
          "warn",
          type.id,
        );
      }
    }

    // 2. Stok konten siap di bawah takaran Manajer: perintahkan tim memproduksi.
    const active = state.orders.filter(
      (o) => o.typeId === type.id && o.status === "berjalan",
    );
    const want = Math.min(MAX_ORDERS, shortage);
    if (want > active.length) {
      const taken = new Set(
        state.orders
          .filter((o) => o.typeId === type.id && o.status !== "selesai")
          .map((o) => o.chapterId),
      );
      const next = chapters.filter(
        (c) =>
          !taken.has(c.id) &&
          !busy(c) &&
          (!c.article ||
            nextBookJob(type, c, settings, c.production_jobs || []) !== null),
      );
      if (!next.length)
        note(
          `topics:${type.id}`,
          `${type.name}: stok konten siap kurang untuk ${shortFor.join(", ")}, tetapi tidak ada topik yang bisa diproduksi. Tambahkan topik baru di Produksi.`,
          "warn",
          type.id,
        );
      for (const c of next.slice(0, want - active.length)) {
        state.orders.push({
          at: now,
          updated: now,
          typeId: type.id,
          chapterId: c.id,
          title: c.title,
          reason: `Persiapan stok ${shortFor.join(", ")}`,
          status: "berjalan",
        });
        log(
          `Stok ${type.name} kurang untuk ${shortFor.join(", ")}: memerintahkan tim memproduksi ${partLabel(c)}.`,
          "info",
          type.id,
        );
        state.lastActionAt = now;
      }
    }

    // 3. Kawal produksi yang sudah diperintahkan sampai output akhirnya jadi.
    for (const order of state.orders.filter(
      (o) => o.typeId === type.id && o.status === "berjalan",
    )) {
      const c = chapters.find((x) => x.id === order.chapterId);
      if (!c) {
        order.status = "macet";
        order.note = "Topik sudah dihapus";
        order.updated = now;
        continue;
      }
      if (busy(c)) continue;
      const attempts = c.production_jobs || [];
      const kind = c.article
        ? nextBookJob(type, c, settings, attempts)
        : "ARTICLE";
      if (kind) {
        try {
          await store.enqueue(c.id, kind);
          order.updated = now;
          state.lastActionAt = now;
          log(
            `Menyuruh ${staffFor(kind)} ${taskFor(kind)}: ${partLabel(c)}.`,
            "info",
            type.id,
          );
        } catch (e) {
          order.status = "macet";
          order.note = (e as Error).message;
          order.updated = now;
          log(`Produksi ${partLabel(c)} macet: ${order.note}`, "warn", type.id);
        }
        continue;
      }
      const results: Record<string, unknown> = {
        POST_IMAGE: c.text_image,
        PANEL: c.panels,
        VIDEO_KALIMAT: c.sentence_video,
        VIDEO_KALIMAT_H: c.sentence_video_h,
      };
      const missing = type.outputs.filter(
        (k: string) => k in results && !results[k],
      );
      order.updated = now;
      if (!missing.length) {
        order.status = "selesai";
        log(
          `Produksi ${partLabel(c)} selesai dan siap diposting.`,
          "ok",
          type.id,
        );
      } else {
        const failedJob = attempts.find((j) => j.state === "failed");
        order.status = "macet";
        order.note =
          failedJob?.error ||
          (c.article_status !== "siap"
            ? `Artikel berstatus ${c.article_status}`
            : `Output belum lengkap: ${missing.join(", ")}`);
        log(
          `Produksi ${partLabel(c)} macet: ${order.note}. Manajer beralih ke topik lain.`,
          "warn",
          type.id,
        );
      }
    }
  }
}

/** Ringkasan Manajer untuk satu jenis konten (dipakai /api/office). */
export function managerView(
  state: ManagerState,
  type: Pick<ContentType, "id" | "settings">,
  targetMap: TargetMap,
  now: number,
) {
  const today = wibDayStart(now);
  const targets = activeTargets(targetMap, type);
  const view = {} as Record<
    Platform,
    {
      done: number;
      inflight: number;
      failed: number;
      slots: SlotView[];
      next: number | null;
      ready: number | null;
      check: ReturnType<typeof availability> | null;
    }
  >;
  const producing = state.orders.filter(
    (o) => o.typeId === type.id && o.status === "berjalan",
  ).length;
  for (const platform of PLATFORMS) {
    const mine = state.posts.filter(
      (p) => p.typeId === type.id && p.platform === platform && p.at >= today,
    );
    const slots = scheduleView(
      slotTimes(targets[platform], today, `${today}:${type.id}:${platform}`),
      mine,
      now,
    );
    const done = mine.filter((p) => p.status === "terbit").length;
    view[platform] = {
      done,
      inflight: mine.filter((p) => p.status === "proses").length,
      failed: mine.filter((p) => p.status === "gagal").length,
      slots,
      next:
        done >= targets[platform]
          ? null
          : (slots.find((s) => s.status === "terjadwal")?.at ??
            (slots.some((s) => s.status === "terlewat") ? now : null)),
      ready: state.stock[`${type.id}:${platform}`]?.ready ?? null,
      check:
        targets[platform] && state.stock[`${type.id}:${platform}`]
          ? availability(
              state.stock[`${type.id}:${platform}`].ready,
              targets[platform],
              done,
              mine.filter((p) => p.status === "proses").length,
              producing,
            )
          : null,
    };
  }
  return view;
}
