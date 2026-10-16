// Lab Berita: tiap lab mandiri menghasilkan artikel final. Isinya tema global,
// link sumber rujukan, dan prompt artikel. Jurnalis tidak menimbun stok: saat
// produksi jenis konten yang memakai lab ini memanggilnya (jadwal milik jenis
// konten), atau saat Tes, ia memilih satu berita terbaru lalu menulis artikelnya.
// Link yang dipakai dicatat di news_lab_links dan tidak pernah dipakai dua kali.
import { createHash } from "node:crypto";
import type mysql from "mysql2/promise";
import { normalizeDomain } from "./content-contract";
import { newsSourceKey } from "./news";

export type NewsLabInput = {
  theme: string;
  sources: string[];
  prompt: string;
};
/** Hasil Tes: berita dan artikelnya hanya ditampilkan, tidak dicatat. */
export type NewsLabTest = {
  state: "queued" | "running" | "done" | "failed";
  links: string[];
  article: string | null;
  error: string | null;
  at: number | null;
};
export type NewsLab = NewsLabInput & {
  id: number;
  enabled: boolean;
  test: NewsLabTest | null;
  // Aktivitas Jurnalis terakhir untuk lab ini (dipanggil produksi).
  state: "idle" | "running" | "failed";
  error: string | null;
  lastRunAt: number | null;
};
export type NewsLabLink = {
  id: number;
  labId: number;
  url: string;
  usedAt: number;
  newsId: number | null;
  inaccessible: boolean;
};
// Tes "running" yang tidak selesai dalam batas ini dianggap terhenti.
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
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !normalizeDomain(url.hostname)
    )
      throw Error(`Sumber "${text.slice(0, 60)}" bukan link yang valid`);
    const href = url.href.replace(/\/$/, "");
    if (!sources.includes(href)) sources.push(href);
  }
  if (!sources.length) throw Error("Isi minimal satu link sumber rujukan");
  const prompt = typeof value.prompt === "string" ? value.prompt.trim() : "";
  if (!prompt || prompt.length > 100000)
    throw Error("Prompt artikel wajib diisi, maksimal 100.000 karakter");
  if (/\{\{\w+\}\}/.test(prompt))
    throw Error(
      "Prompt artikel tidak memakai placeholder {{…}}; link berita dan tema sudah dikirim otomatis",
    );
  return { theme, sources, prompt };
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
  used: string[],
) {
  return `Kamu adalah Jurnalis NC Post. Tema liputan: ${lab.theme}.

Cari berita yang paling baru terbit saat ini dan sesuai tema, hanya dari sumber rujukan berikut:
${lab.sources.map((s) => `- ${s}`).join("\n")}

Pilih satu berita yang paling baru terbit. Pilihan wajib berupa link lengkap halaman artikel berita (HTTPS, bukan halaman depan, kategori, atau pencarian) dari domain sumber di atas, dan sudah kamu buka untuk memastikan isinya sesuai tema serta waktu terbitnya.
${used.length ? `\nJangan memilih link berikut karena sudah pernah dipakai:\n${used.map((u) => `- ${u}`).join("\n")}\n` : ""}
Kembalikan hanya JSON: {"link": "https://..."}`;
}

const toLab = (r: any): NewsLab => ({
  id: r.id,
  theme: r.theme,
  sources: JSON.parse(r.sources || "[]"),
  prompt: r.prompt ?? "",
  enabled: !!r.enabled,
  test: r.test_state
    ? {
        state: r.test_state,
        ...{ links: [], article: null, error: null },
        ...(r.test_result ? JSON.parse(r.test_result) : {}),
        at: r.test_at === null ? null : Number(r.test_at),
      }
    : null,
  state: r.state,
  error: r.error ?? null,
  lastRunAt: r.last_run_at === null ? null : Number(r.last_run_at),
});

export class NewsLabStore {
  constructor(readonly db: Pick<mysql.Pool, "query">) {}
  async list(): Promise<NewsLab[]> {
    const [rows]: any = await this.db.query(
      "SELECT * FROM news_labs ORDER BY id",
    );
    return rows.map(toLab);
  }
  async get(id: number) {
    const [rows]: any = await this.db.query(
      "SELECT * FROM news_labs WHERE id=?",
      [id],
    );
    if (!rows.length) throw Error("Lab Berita tidak ditemukan");
    return toLab(rows[0]);
  }
  async create(input: unknown) {
    const lab = normalizeNewsLab(input);
    const [r]: any = await this.db.query(
      "INSERT INTO news_labs(theme,sources,prompt) VALUES(?,?,?)",
      [lab.theme, JSON.stringify(lab.sources), lab.prompt],
    );
    return r.insertId as number;
  }
  async update(id: number, input: unknown) {
    const lab = normalizeNewsLab(input);
    const [r]: any = await this.db.query(
      "UPDATE news_labs SET theme=?,sources=?,prompt=? WHERE id=?",
      [lab.theme, JSON.stringify(lab.sources), lab.prompt, id],
    );
    if (!r.affectedRows) throw Error("Lab Berita tidak ditemukan");
  }
  async setEnabled(id: number, enabled: boolean) {
    const [r]: any = await this.db.query(
      "UPDATE news_labs SET enabled=? WHERE id=?",
      [enabled ? 1 : 0, id],
    );
    if (!r.affectedRows) throw Error("Lab Berita tidak ditemukan");
  }
  /** Riwayat link tetap disimpan agar link lama tidak dipakai ulang. */
  async remove(id: number) {
    await this.db.query("DELETE FROM news_labs WHERE id=?", [id]);
  }
  /** Status Jurnalis untuk lab (tampil di Lab Berita dan kantor). */
  async working(id: number, now = Date.now()) {
    await this.db.query(
      "UPDATE news_labs SET state='running',error=NULL,last_run_at=? WHERE id=?",
      [now, id],
    );
  }
  async finish(id: number, error: string | null) {
    await this.db.query("UPDATE news_labs SET state=?,error=? WHERE id=?", [
      error ? "failed" : "idle",
      error,
      id,
    ]);
  }
  /** Antrekan Tes; dikerjakan Jurnalis di worker secepatnya. */
  async requestTest(id: number, now = Date.now()) {
    const [r]: any = await this.db.query(
      "UPDATE news_labs SET test_state='queued',test_result=NULL,test_at=? WHERE id=? AND (test_state IS NULL OR test_state NOT IN ('queued','running') OR test_at<?)",
      [now, id, now - JURNALIS_STALE_MS],
    );
    if (!r.affectedRows) throw Error("Tes lab ini masih berjalan");
  }
  async claimTest(now = Date.now()) {
    const lab = (await this.list()).find(
      (l) =>
        l.test &&
        (l.test.state === "queued" ||
          (l.test.state === "running" &&
            (l.test.at ?? 0) < now - JURNALIS_STALE_MS)),
    );
    if (!lab) return null;
    const [r]: any = await this.db.query(
      "UPDATE news_labs SET test_state='running',test_at=? WHERE id=? AND test_state=? AND test_at=?",
      [now, lab.id, lab.test!.state, lab.test!.at],
    );
    return r.affectedRows ? lab : null;
  }
  async finishTest(
    id: number,
    result: { links: string[]; article: string | null; error: string | null },
  ) {
    await this.db.query(
      "UPDATE news_labs SET test_state=?,test_result=? WHERE id=?",
      [result.error ? "failed" : "done", JSON.stringify(result), id],
    );
  }
  async links(limit = 200): Promise<NewsLabLink[]> {
    const [rows]: any = await this.db.query(
      "SELECT id,lab_id,url,used_at,news_id,inaccessible FROM news_lab_links ORDER BY id DESC LIMIT ?",
      [limit],
    );
    return rows.map((r: any) => ({
      id: r.id,
      labId: r.lab_id,
      url: r.url,
      usedAt: Number(r.used_at),
      newsId: r.news_id ?? null,
      inaccessible: !!r.inaccessible,
    }));
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
  /** Link yang sudah dipegang artikel ini (percobaan ulang memakai link yang sama). */
  async held(newsId: number): Promise<string | null> {
    const [rows]: any = await this.db.query(
      "SELECT url FROM news_lab_links WHERE news_id=? ORDER BY id LIMIT 1",
      [newsId],
    );
    return (rows[0]?.url as string) ?? null;
  }
  /** Link tidak bisa diakses: tetap tercatat terpakai, dilepas dari artikel. */
  async release(newsId: number, url: string) {
    await this.db.query(
      "UPDATE news_lab_links SET news_id=NULL,inaccessible=1 WHERE news_id=? AND url_hash=?",
      [newsId, linkHash(url)],
    );
  }
  /** Catat link yang dipakai artikel; gagal bila link sudah pernah dipakai. */
  async use(labId: number, url: string, newsId: number, now = Date.now()) {
    const [r]: any = await this.db.query(
      "INSERT IGNORE INTO news_lab_links(lab_id,url,url_hash,used_at,news_id) VALUES(?,?,?,?,?)",
      [labId, url, linkHash(url), now, newsId],
    );
    if (!r.affectedRows) throw Error("Link berita sudah pernah dipakai");
  }
}
