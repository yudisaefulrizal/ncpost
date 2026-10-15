// Statistik akun sosmed harian. NC-WA hanya memberi kondisi saat ini (follower,
// serta likes & views total bulan berjalan), jadi NC Post menyimpan satu baris
// per akun per tanggal WIB dan menghitung perkembangan harian dari selisihnya.
// TikTok/YouTube belum tersedia (Zernio butuh add-on Analytics berbayar).
import type mysql from "mysql2/promise";

const WIB = 7 * 3600000;
const DAY = 86400000;
export const wibDate = (ts: number) =>
  new Date(ts + WIB).toISOString().slice(0, 10);

export const STATS_TABLE = `CREATE TABLE IF NOT EXISTS account_stats (
  platform VARCHAR(16) NOT NULL,
  account_id VARCHAR(64) NOT NULL,
  stat_date DATE NOT NULL,
  username VARCHAR(190) NOT NULL DEFAULT '',
  followers INT NULL,
  likes_month BIGINT NULL,
  views_month BIGINT NULL,
  month_from VARCHAR(40) NULL,
  unavailable TEXT NULL,
  fetched_at DATETIME NOT NULL,
  PRIMARY KEY (platform, account_id, stat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

type Db = Pick<mysql.Pool, "query">;
let ensured = false;
// Tabel dibuat sendiri bila belum ada (sama dengan schema.sql), jadi deploy
// tanpa `npm run migrate` tidak membuat fitur ini gagal.
async function ensureTable(db: Db) {
  if (ensured) return;
  await db.query(STATS_TABLE);
  ensured = true;
}

export type Summary = {
  username: string;
  followers: number;
  likes: number | null;
  views: number | null;
  monthFrom: string | null;
  unavailable: string[];
};
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;

/** Respons /accounts/:ig/summary NC-WA → angka yang disimpan. */
export function parseSummary(data: any): Summary {
  const followers = num(data?.followers);
  if (followers === null)
    throw Error("NC-WA tidak mengembalikan jumlah follower");
  const month = data?.month ?? {};
  return {
    username: String(data?.username ?? "").slice(0, 190),
    followers,
    likes: num(month.likes),
    views: num(month.views),
    monthFrom: typeof month.from === "string" ? month.from.slice(0, 40) : null,
    unavailable: Array.isArray(month.unavailable)
      ? month.unavailable.filter((x: unknown) => typeof x === "string")
      : [],
  };
}

export type StatRow = {
  date: string;
  username: string;
  followers: number | null;
  likesMonth: number | null;
  viewsMonth: number | null;
  monthFrom: string | null;
  unavailable: string[];
  fetchedAt: number;
};
export type DailyPoint = StatRow & {
  followersDelta: number | null;
  likes: number | null;
  views: number | null;
  // Jumlah hari yang digabung dalam selisih ini (lebih dari 1 = ada hari bolong).
  span: number;
};

const dayDiff = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const monthKey = (from: string | null) => (from ? from.slice(0, 7) : null);

/**
 * Perkembangan harian dari baris berurutan menurut tanggal. Likes & views dari
 * NC-WA adalah total bulan berjalan: selisih dengan hari sebelumnya, atau nilai
 * hari itu sendiri bila bulannya baru dimulai. Selisih negatif (revisi data
 * Meta) dianggap tidak diketahui.
 */
export function dailySeries(rows: StatRow[]): DailyPoint[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((row, i) => {
    const prev = sorted[i - 1];
    const span = prev ? dayDiff(prev.date, row.date) : 1;
    const sameMonth =
      !!prev &&
      monthKey(prev.monthFrom) !== null &&
      monthKey(prev.monthFrom) === monthKey(row.monthFrom);
    const monthly = (cur: number | null, before: number | null) => {
      if (cur === null) return null;
      if (!prev) return null;
      if (!sameMonth) return cur;
      if (before === null) return null;
      const d = cur - before;
      return d >= 0 ? d : null;
    };
    return {
      ...row,
      span,
      followersDelta:
        prev && prev.followers !== null && row.followers !== null
          ? row.followers - prev.followers
          : null,
      likes: monthly(row.likesMonth, prev?.likesMonth ?? null),
      views: monthly(row.viewsMonth, prev?.viewsMonth ?? null),
    };
  });
}

type InstagramDeps = {
  accounts: () => Promise<{
    state: string;
    reason?: string;
    accounts?: { id: string; username: string }[];
  }>;
  summary: (id: string) => Promise<unknown>;
};

/** Ambil statistik semua akun Instagram dan simpan sebagai data hari ini (WIB). */
export async function snapshotInstagram(
  db: Db,
  deps: InstagramDeps,
  now = Date.now(),
) {
  const conn = await deps.accounts();
  if (conn.state !== "connected")
    return { saved: 0, errors: [conn.reason || "NC-WA belum terhubung"] };
  await ensureTable(db);
  const date = wibDate(now);
  let saved = 0;
  const errors: string[] = [];
  for (const account of conn.accounts ?? []) {
    try {
      const s = parseSummary(await deps.summary(account.id));
      await db.query(
        `INSERT INTO account_stats(platform,account_id,stat_date,username,followers,likes_month,views_month,month_from,unavailable,fetched_at)
         VALUES('instagram',?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE username=VALUES(username),followers=VALUES(followers),likes_month=VALUES(likes_month),views_month=VALUES(views_month),month_from=VALUES(month_from),unavailable=VALUES(unavailable),fetched_at=VALUES(fetched_at)`,
        [
          account.id,
          date,
          s.username || account.username,
          s.followers,
          s.likes,
          s.views,
          s.monthFrom,
          JSON.stringify(s.unavailable),
          new Date(now),
        ],
      );
      saved++;
    } catch (e) {
      errors.push(`@${account.username}: ${(e as Error).message}`);
    }
  }
  return { saved, errors };
}

const UNAVAILABLE = {
  available: false,
  reason:
    "Belum tersedia: statistik TikTok dan YouTube lewat Zernio memerlukan add-on Analytics berbayar.",
};

/** Data halaman Statistik Akun untuk `days` hari terakhir. */
export async function accountStats(
  db: Db,
  deps: Pick<InstagramDeps, "accounts">,
  days = 30,
  now = Date.now(),
) {
  await ensureTable(db);
  const since = wibDate(now - days * DAY);
  const [rows]: any = await db.query(
    "SELECT account_id,DATE_FORMAT(stat_date,'%Y-%m-%d') AS d,username,followers,likes_month,views_month,month_from,unavailable,fetched_at FROM account_stats WHERE platform='instagram' AND stat_date>=? ORDER BY account_id,stat_date",
    [since],
  );
  const conn = await deps.accounts();
  const byId = new Map<string, StatRow[]>();
  for (const r of rows) {
    const list = byId.get(r.account_id) ?? [];
    let unavailable: string[] = [];
    try {
      unavailable = JSON.parse(r.unavailable || "[]");
    } catch {
      unavailable = [];
    }
    list.push({
      date: r.d,
      username: r.username,
      followers: r.followers == null ? null : Number(r.followers),
      likesMonth: r.likes_month == null ? null : Number(r.likes_month),
      viewsMonth: r.views_month == null ? null : Number(r.views_month),
      monthFrom: r.month_from,
      unavailable,
      fetchedAt: new Date(r.fetched_at).getTime(),
    });
    byId.set(r.account_id, list);
  }
  // Akun yang terhubung di NC-WA tampil walau datanya belum ada.
  const ids = new Set([
    ...(conn.accounts ?? []).map((a) => a.id),
    ...byId.keys(),
  ]);
  const accounts = [...ids].map((id) => {
    const series = dailySeries(byId.get(id) ?? []);
    const latest = series[series.length - 1] ?? null;
    return {
      id,
      username:
        latest?.username ||
        conn.accounts?.find((a) => a.id === id)?.username ||
        id,
      connected: !!conn.accounts?.some((a) => a.id === id),
      latest,
      series,
    };
  });
  return {
    days,
    today: wibDate(now),
    instagram: {
      available: true,
      state: conn.state,
      reason: conn.reason ?? "",
      accounts,
    },
    tiktok: UNAVAILABLE,
    youtube: UNAVAILABLE,
  };
}
