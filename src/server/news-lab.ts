// Lab Berita: tiap lab punya tema global, daftar link sumber rujukan, dan target
// berita per hari. Jurnalis (worker) mengerjakan semua lab bergiliran; link yang
// dipilihnya dicatat di news_lab_links dan tidak pernah dipakai dua kali.
// Produksi jenis konten Berita mengambil link pilihan Jurnalis dari lab-nya.
import { createHash } from "node:crypto";
import type mysql from "mysql2/promise";
import { normalizeDomain } from "./content-contract";
import { newsSourceKey } from "./news";
import { wibDayStart } from "./office";

export type NewsLabInput = {
  theme: string;
  sources: string[];
  dailyTarget: number;
};
export type NewsLab = NewsLabInput & {
  id: number;
  state: "idle" | "running" | "failed";
  error: string | null;
  lastRunAt: number | null;
  today: number;
  pending: number;
};
export type NewsLabLink = {
  id: number;
  labId: number;
  theme: string | null;
  url: string;
  usedAt: number;
  newsId: number | null;
};
// Jurnalis yang gagal menunggu sebentar sebelum mencoba lab itu lagi; job
// "running" yang tidak selesai dalam batas ini dianggap terhenti.
export const JURNALIS_RETRY_MS = 30 * 60000;
export const JURNALIS_STALE_MS = 20 * 60000;

export function normalizeNewsLab(value: any): NewsLabInput {
  const theme = typeof value?.theme === "string" ? value.theme.trim() : "";
  if (!theme || theme.length > 190)
    throw Error("Tema wajib diisi, maksimal 190 karakter");
  if (!Array.isArray(value.sources) || value.sources.length > 50)
    throw Error("Sumber rujukan maksimal 50 link");
  const sources: string[] = [];
  for (const item of value.sources) {
    const text = typeof item === "string" ? item.trim() : "";
    if (!text) continue;
    let url: URL;
    try {
      url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
      throw Error(`Sumber "${text.slice(0, 60)}" bukan link yang valid`);
    }
    if (!["http:", "https:"].includes(url.protocol) || !normalizeDomain(url.hostname))
      throw Error(`Sumber "${text.slice(0, 60)}" bukan link yang valid`);
    const href = url.href.replace(/\/$/, "");
    if (!sources.includes(href)) sources.push(href);
  }
  if (!sources.length) throw Error("Isi minimal satu link sumber rujukan");
  const target = value.dailyTarget;
  if (!Number.isSafeInteger(target) || target < 0 || target > 50)
    throw Error("Target per hari harus bilangan bulat 0–50");
  return { theme, sources, dailyTarget: target };
}

/** Domain sumber rujukan; link berita wajib berasal dari salah satunya. */
export const sourceHosts = (sources: string[]) => [
  ...new Set(
    sources.map((s) => normalizeDomain(s)).filter((d): d is string => !!d),
  ),
];
export const hostAllowed = (host: string, hosts: string[]) =>
  hosts.some((h) => host === h || host.endsWith("." + h));
export const linkHash = (url: string) =>
  createHash("sha256").update(newsSourceKey(url).url).digest("hex");

/** Link valid dari hasil Jurnalis: HTTPS, domain sumber, belum dipakai, unik. */
export function acceptLinks(
  raw: unknown,
  sources: string[],
  used: Set<string>,
  limit: number,
) {
  const hosts = sourceHosts(sources);
  const out: string[] = [];
  const seen = new Set(used);
  for (const item of Array.isArray(raw) ? raw : []) {
    if (out.length >= limit) break;
    if (typeof item !== "string") continue;
    let key: { host: string; url: string };
    try {
      key = newsSourceKey(item.trim());
    } catch {
      continue;
    }
    const page = new URL(key.url);
    // Halaman depan sumber bukan berita.
    if (page.pathname === "/" || !hostAllowed(key.host, hosts)) continue;
    const hash = linkHash(key.url);
    if (seen.has(hash)) continue;
    seen.add(hash);
    out.push(key.url);
  }
  return out;
}

export function jurnalisPrompt(
  lab: Pick<NewsLab, "theme" | "sources">,
  count: number,
  used: string[],
) {
  return `Kamu adalah Jurnalis NC Post. Tema liputan: ${lab.theme}.

Cari berita terbaru yang sesuai tema, hanya dari sumber rujukan berikut:
${lab.sources.map((s) => `- ${s}`).join("\n")}

Pilih ${count} berita berbeda yang paling layak diangkat menjadi konten. Setiap pilihan wajib berupa link lengkap halaman artikel berita (HTTPS, bukan halaman depan, kategori, atau pencarian) dari domain sumber di atas, dan sudah kamu buka untuk memastikan isinya sesuai tema.
${used.length ? `\nJangan memilih link berikut karena sudah pernah dipakai:\n${used.map((u) => `- ${u}`).join("\n")}\n` : ""}
Kembalikan hanya JSON: {"links": ["https://..."]}`;
}

const toLab = (r: any): NewsLab => ({
  id: r.id,
  theme: r.theme,
  sources: JSON.parse(r.sources || "[]"),
  dailyTarget: r.daily_target,
  state: r.state,
  error: r.error ?? null,
  lastRunAt: r.last_run_at === null ? null : Number(r.last_run_at),
  today: Number(r.today ?? 0),
  pending: Number(r.pending ?? 0),
});

export class NewsLabStore {
  constructor(readonly db: Pick<mysql.Pool, "query">) {}
  async list(now = Date.now()): Promise<NewsLab[]> {
    const [rows]: any = await this.db.query(
      `SELECT l.*,
        (SELECT COUNT(*) FROM news_lab_links k WHERE k.lab_id=l.id AND k.used_at>=?) AS today,
        (SELECT COUNT(*) FROM news_lab_links k WHERE k.lab_id=l.id AND k.news_id IS NULL) AS pending
       FROM news_labs l ORDER BY l.id`,
      [wibDayStart(now)],
    );
    return rows.map(toLab);
  }
  async get(id: number) {
    const lab = (await this.list()).find((l) => l.id === id);
    if (!lab) throw Error("Lab Berita tidak ditemukan");
    return lab;
  }
  async create(input: unknown) {
    const lab = normalizeNewsLab(input);
    const [r]: any = await this.db.query(
      "INSERT INTO news_labs(theme,sources,daily_target) VALUES(?,?,?)",
      [lab.theme, JSON.stringify(lab.sources), lab.dailyTarget],
    );
    return r.insertId as number;
  }
  async update(id: number, input: unknown) {
    const lab = normalizeNewsLab(input);
    const [r]: any = await this.db.query(
      "UPDATE news_labs SET theme=?,sources=?,daily_target=?,error=NULL,state=IF(state='failed','idle',state) WHERE id=?",
      [lab.theme, JSON.stringify(lab.sources), lab.dailyTarget, id],
    );
    if (!r.affectedRows) throw Error("Lab Berita tidak ditemukan");
  }
  /** Riwayat link tetap disimpan agar link lama tidak dipakai ulang. */
  async remove(id: number) {
    await this.db.query("DELETE FROM news_labs WHERE id=?", [id]);
  }
  async links(limit = 200): Promise<NewsLabLink[]> {
    const [rows]: any = await this.db.query(
      "SELECT k.id,k.lab_id,l.theme,k.url,k.used_at,k.news_id FROM news_lab_links k LEFT JOIN news_labs l ON l.id=k.lab_id ORDER BY k.id DESC LIMIT ?",
      [limit],
    );
    return rows.map((r: any) => ({
      id: r.id,
      labId: r.lab_id,
      theme: r.theme ?? null,
      url: r.url,
      usedAt: Number(r.used_at),
      newsId: r.news_id ?? null,
    }));
  }
  /** Lab berikutnya yang belum memenuhi target hari ini, bergiliran. */
  async due(now = Date.now()) {
    return (await this.list(now))
      .filter(
        (l) =>
          l.today < l.dailyTarget &&
          l.sources.length > 0 &&
          (l.state === "idle" ||
            (l.state === "failed" &&
              (l.lastRunAt ?? 0) < now - JURNALIS_RETRY_MS) ||
            (l.state === "running" &&
              (l.lastRunAt ?? 0) < now - JURNALIS_STALE_MS)),
      )
      .sort((a, b) => (a.lastRunAt ?? 0) - (b.lastRunAt ?? 0))[0];
  }
  async start(lab: NewsLab, now = Date.now()) {
    const [r]: any = await this.db.query(
      "UPDATE news_labs SET state='running',last_run_at=? WHERE id=? AND state=? AND (last_run_at IS NULL OR last_run_at=?)",
      [now, lab.id, lab.state, lab.lastRunAt],
    );
    return r.affectedRows > 0;
  }
  async finish(id: number, error: string | null) {
    await this.db.query("UPDATE news_labs SET state=?,error=? WHERE id=?", [
      error ? "failed" : "idle",
      error,
      id,
    ]);
  }
  async usedUrls(limit = 150): Promise<string[]> {
    const [rows]: any = await this.db.query(
      "SELECT url FROM news_lab_links ORDER BY id DESC LIMIT ?",
      [limit],
    );
    return rows.map((r: any) => r.url);
  }
  async usedHashes(hashes: string[]) {
    if (!hashes.length) return new Set<string>();
    const [rows]: any = await this.db.query(
      "SELECT url_hash FROM news_lab_links WHERE url_hash IN (?)",
      [hashes],
    );
    return new Set<string>(rows.map((r: any) => r.url_hash));
  }
  /** Catat link pilihan Jurnalis; link yang sudah ada dilewati. */
  async record(labId: number, urls: string[], now = Date.now()) {
    let added = 0;
    for (const url of urls) {
      const [r]: any = await this.db.query(
        "INSERT IGNORE INTO news_lab_links(lab_id,url,url_hash,used_at) VALUES(?,?,?,?)",
        [labId, url, linkHash(url), now],
      );
      added += r.affectedRows;
    }
    return added;
  }
  async pending(labId: number) {
    const [rows]: any = await this.db.query(
      "SELECT COUNT(*) AS n FROM news_lab_links WHERE lab_id=? AND news_id IS NULL",
      [labId],
    );
    return Number(rows[0]?.n ?? 0);
  }
  /** Link untuk artikel berita: pakai yang sudah dipegang, atau ambil yang tertua. */
  async assign(labId: number, newsId: number): Promise<string | null> {
    const held = async () => {
      const [rows]: any = await this.db.query(
        "SELECT url FROM news_lab_links WHERE news_id=? ORDER BY id LIMIT 1",
        [newsId],
      );
      return (rows[0]?.url as string) ?? null;
    };
    const current = await held();
    if (current) return current;
    await this.db.query(
      "UPDATE news_lab_links SET news_id=? WHERE lab_id=? AND news_id IS NULL ORDER BY id LIMIT 1",
      [newsId, labId],
    );
    return held();
  }
}
