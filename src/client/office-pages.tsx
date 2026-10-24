// Halaman kantor yang tidak punya menu lama: Ruang Manajer (target posting
// per jenis konten yang dijalankan Manajer) dan Pusat Sosmed (Admin Sosmed).
// Bisa dibuka di laci kantor atau halaman penuh. Target diatur di Pengaturan
// Konten; Manajer menyusun jam posting dan memerintahkan produksi sendiri.
import React, { useEffect, useState } from "react";
import { api } from "./api";
import type { ContentType } from "../server/content-type-domain";
import type { InstagramConnection } from "../server/instagram-account";
import {
  PLATFORM_LABEL,
  PLAN_PLATFORMS,
  socialPlan,
} from "../server/social-plan";

type Platform = "instagram" | "tiktok" | "youtube";
type Counts = Record<Platform, number>;
type SlotStatus = "proses" | "terbit" | "gagal" | "terjadwal" | "terlewat";
export type ManagerPlatformView = {
  done: number;
  inflight: number;
  failed: number;
  slots: { at: number; status: SlotStatus }[];
  next: number | null;
  ready: number | null;
  check: { today: CheckRow; tomorrow: CheckRow; short: number } | null;
};
type CheckRow = {
  need: number;
  ready: number;
  producing: number;
  status: "siap" | "diproduksi" | "kurang";
};
/** Status stok satu sosmed; besarnya stok yang disiapkan ditentukan Manajer. */
function stockState(check: ManagerPlatformView["check"], producing: number) {
  if (!check) return null;
  if (check.short <= 0) return { tone: "t-ok", label: "✓ cukup" };
  if (producing >= check.short) return { tone: "t-run", label: "disiapkan" };
  return { tone: "t-act", label: "kurang" };
}

/** Checklist ketersediaan: jumlah konten siap per sosmed. */
function Checklist({ office }: { office: OfficeSummary }) {
  const types = office.types.filter((t) =>
    PLATFORMS.some((p) => t.targets[p] > 0),
  );
  if (!types.length) return null;
  const producing = (id: number) =>
    office.manager.orders.filter(
      (o) => o.typeId === id && o.status === "berjalan",
    ).length;
  return (
    <section className="card pad stack">
      <div className="card-title">
        <h2 className="h3">Checklist ketersediaan</h2>
        <span className="muted">
          Manajer sendiri yang menentukan berapa stok yang perlu disiapkan
        </span>
      </div>
      {office.manager.pause && (
        <p className="warn">
          {`Produksi dijeda sampai ${clock(office.manager.pause.until)}: ${office.manager.pause.reason}. Manajer tidak mencoba lagi sebelum itu. Terakhir: ${office.manager.pause.detail}`}
        </p>
      )}
      {!office.manager.checking && (
        <p className="warn">
          {office.manager.lastTickAt
            ? `Manajer tidak memeriksa sejak ${clock(office.manager.lastTickAt)}`
            : "Manajer belum pernah memeriksa"}
          ; jumlah konten siap tidak ditampilkan sampai worker berjalan lagi.
        </p>
      )}
      <div className="table">
        <table className="target-table">
          <thead>
            <tr>
              <th>Jenis konten</th>
              <th>Sosmed</th>
              <th className="num">Konten siap</th>
              <th className="num">Diproduksi</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {types.flatMap((t) =>
              PLATFORMS.filter((p) => t.targets[p] > 0).map((p, i) => {
                const view = t.manager[p];
                const st = stockState(view.check, producing(t.id));
                return (
                  <tr key={t.id + p}>
                    <td>{i === 0 && <b>{t.name}</b>}</td>
                    <td>{PLATFORM_LABEL[p]}</td>
                    <td className="num mono">{view.ready ?? "–"}</td>
                    <td className="num mono">{producing(t.id)}</td>
                    <td>
                      {t.engine === "news" ? (
                        <span className="muted">Dibuat saat posting</span>
                      ) : st ? (
                        <span className={"chip chip-xs " + st.tone}>
                          {st.label}
                        </span>
                      ) : (
                        <span className="muted">Menunggu pemeriksaan</span>
                      )}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export type OfficeType = {
  id: number;
  name: string;
  engine: string;
  active: Platform[];
  targets: Counts;
  today: Counts;
  inflight: Counts;
  failed: Counts;
  manager: Record<Platform, ManagerPlatformView>;
};
export type OfficeSummary = {
  date: string;
  types: OfficeType[];
  targets: Counts;
  progress: Counts;
  today: Counts;
  todayAll: Counts;
  next: Record<Platform, number | null>;
  history: ({ date: string } & Counts)[];
  manager: {
    lastActionAt: number;
    lastTickAt: number;
    checking: boolean;
    pause: { until: number; reason: string; detail: string } | null;
    orders: {
      at: number;
      updated: number;
      typeId: number;
      typeName: string | null;
      chapterId: number;
      title: string;
      reason: string;
      status: "berjalan" | "selesai" | "macet";
      note?: string;
    }[];
    log: {
      at: number;
      text: string;
      tone: "info" | "ok" | "warn";
      typeName: string | null;
    }[];
  };
  recent: {
    platform: Platform;
    typeName: string | null;
    kind: string;
    title: string;
    status: string;
    sent: boolean;
    at: number;
    byManager: boolean;
  }[];
};
export const PLATFORMS: Platform[] = ["instagram", "tiktok", "youtube"];
const total = (c: Counts) => PLATFORMS.reduce((n, p) => n + c[p], 0);

export function useOffice(refreshMs = 30000) {
  const [office, setOffice] = useState<OfficeSummary | null>(null);
  const [error, setError] = useState("");
  const load = async () => {
    try {
      setOffice(await api("/office", "GET", undefined, null));
      setError("");
    } catch (e: any) {
      setError(e?.message || "Ringkasan kantor tidak bisa dibaca");
    }
  };
  useEffect(() => {
    load();
    const t = setInterval(load, refreshMs);
    return () => clearInterval(t);
  }, []);
  return { office, error, reload: load };
}

export const longDate = (date: string) =>
  new Date(date + "T12:00:00+07:00").toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jakarta",
  });
const shortDate = (date: string) =>
  new Date(date + "T12:00:00+07:00").toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  });
export const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
const clock = (ms: number) =>
  new Date(ms).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });

export function targetState(done: number, target: number) {
  if (!target) return { tone: "t-none", label: "Tanpa target" };
  if (done >= target) return { tone: "t-ok", label: "Tercapai" };
  return { tone: "t-act", label: `Kurang ${target - done}` };
}

export function postLabel(r: { sent: boolean; status: string }) {
  if (r.sent) return "Terbit";
  const s = r.status.toLowerCase();
  if (["failed", "error", "gagal"].includes(s)) return "Gagal";
  if (s === "unknown") return "Belum pasti";
  return r.status;
}

/** Keterangan langkah Manajer berikutnya untuk satu sosmed. */
export function nextLabel(
  view: Pick<ManagerPlatformView, "next" | "ready" | "inflight">,
  done: number,
  target: number,
) {
  if (!target) return "";
  if (done >= target) return "Selesai untuk hari ini";
  if (view.inflight) return "Sedang memposting…";
  const remaining = target - done;
  if (view.ready != null && view.ready < remaining)
    return `Stok siap ${view.ready}, Manajer menyuruh tim produksi`;
  return view.next ? `Berikutnya ±${hhmm(view.next)}` : "";
}

/** Ringkasan semua jenis konten: capaian dihitung per jenis lalu dijumlahkan. */
export function TargetTiles({ office }: { office: OfficeSummary }) {
  return (
    <div className="target-tiles">
      {PLATFORMS.map((p) => {
        const target = office.targets[p],
          done = target ? office.progress[p] : office.today[p];
        const st = targetState(done, target);
        const pct = target ? Math.min(100, (done / target) * 100) : 0;
        const next = office.next[p];
        return (
          <div key={p} className="target-tile">
            <div className="target-tile-head">
              <span>{PLATFORM_LABEL[p]}</span>
              <span className={"chip chip-xs " + st.tone}>{st.label}</span>
            </div>
            <div className="target-value">
              <b className="mono">{done}</b>
              <span className="muted"> / {target || "–"} posting</span>
            </div>
            <div
              className="target-meter"
              role="meter"
              aria-label={`${PLATFORM_LABEL[p]} hari ini`}
              aria-valuemin={0}
              aria-valuemax={target || 1}
              aria-valuenow={done}
            >
              <span className={st.tone} style={{ width: pct + "%" }} />
            </div>
            <small className="muted">
              {target > 0 && done < target && next
                ? `Berikutnya ±${hhmm(next)} · `
                : ""}
              {office.todayAll[p]} terbit hari ini (termasuk jadwal manual)
            </small>
          </div>
        );
      })}
    </div>
  );
}

/** Sel capaian satu sosmed untuk satu jenis konten. */
function TypeCell({ t, p }: { t: OfficeType; p: Platform }) {
  const target = t.targets[p],
    done = t.today[p];
  if (!target) return <span className="muted">Tanpa target</span>;
  const st = targetState(done, target);
  const note = nextLabel(t.manager[p], done, target);
  return (
    <div className="social-cell">
      <span>
        <b className="mono">
          {done}/{target}
        </b>{" "}
        <span className={"chip chip-xs " + st.tone}>{st.label}</span>
      </span>
      {note && (
        <small className={/Stok/.test(note) ? "warn" : "muted"}>{note}</small>
      )}
    </div>
  );
}

const SLOT_LABEL: Record<SlotStatus, string> = {
  terbit: "terbit",
  proses: "diproses",
  gagal: "gagal",
  terjadwal: "terjadwal",
  terlewat: "dikejar",
};
const SLOT_TONE: Record<SlotStatus, string> = {
  terbit: "t-ok",
  proses: "t-run",
  gagal: "t-block",
  terjadwal: "t-none",
  terlewat: "t-act",
};

/** Target harian Manajer: semua jenis konten × sosmed yang aktif di jenis itu. */
function TargetForm({
  office,
  onSaved,
  onConfigure,
}: {
  office: OfficeSummary;
  onSaved: () => Promise<void>;
  onConfigure: (typeId: number) => void;
}) {
  const initial = () =>
    Object.fromEntries(office.types.map((t) => [t.id, { ...t.targets }]));
  const [draft, setDraft] = useState<Record<number, Counts>>(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const dirty = office.types.some((t) =>
    PLATFORMS.some((p) => (draft[t.id]?.[p] ?? 0) !== t.targets[p]),
  );
  // Ikuti data terbaru selama belum ada perubahan yang belum disimpan.
  useEffect(() => {
    if (!dirty) setDraft(initial());
  }, [JSON.stringify(office.types.map((t) => [t.id, t.targets, t.active]))]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote("");
    try {
      await api(
        "/manager/targets",
        "PUT",
        {
          targets: Object.fromEntries(
            office.types.map((t) => [t.id, draft[t.id] ?? t.targets]),
          ),
        },
        null,
      );
      await onSaved();
      setNote("Target disimpan");
    } catch (err: any) {
      setNote(err?.message || "Target gagal disimpan");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card pad stack">
      <div className="card-title">
        <h2 className="h3">Target harian</h2>
        <span className="muted">
          Jumlah posting per hari (WIB), 0 = tanpa target
        </span>
      </div>
      <form className="stack" onSubmit={save}>
        <div className="table">
          <table className="target-table">
            <thead>
              <tr>
                <th>Jenis konten</th>
                {PLATFORMS.map((p) => (
                  <th key={p}>{PLATFORM_LABEL[p]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {office.types.map((t) => (
                <tr key={t.id}>
                  <td>
                    <b>{t.name}</b>
                  </td>
                  {PLATFORMS.map((p) => (
                    <td key={p}>
                      {t.active.includes(p) ? (
                        <span className="target-input">
                          <input
                            type="number"
                            min={0}
                            max={50}
                            step={1}
                            inputMode="numeric"
                            aria-label={`Target ${PLATFORM_LABEL[p]} ${t.name}`}
                            value={draft[t.id]?.[p] ?? 0}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                [t.id]: {
                                  ...(draft[t.id] ?? t.targets),
                                  [p]: Math.max(
                                    0,
                                    Math.min(
                                      50,
                                      Math.round(Number(e.target.value) || 0),
                                    ),
                                  ),
                                },
                              })
                            }
                          />
                          {t.targets[p] > 0 && (
                            <small className="muted mono">
                              hari ini {t.today[p]}/{t.targets[p]}
                            </small>
                          )}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="Aktifkan sosmed ini di Rencana konten sosmed"
                          onClick={() => onConfigure(t.id)}
                        >
                          nonaktif
                        </button>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row-gap">
          <button className="btn btn-pri" disabled={busy || !dirty}>
            Simpan target
          </button>
          {note && (
            <span className="muted" role="status">
              {note}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

export function ManagerRoom({
  onConfigure,
}: {
  onConfigure: (typeId: number) => void;
}) {
  const { office, error, reload } = useOffice(20000);
  if (!office)
    return <div className="card empty">{error || "Memuat ruang manajer…"}</div>;
  const targetTotal = total(office.targets);
  const active = office.types.filter((t) => total(t.targets) > 0);
  const { orders, log } = office.manager;
  return (
    <div className="stack-lg office-page">
      <section className="card pad stack">
        <div className="card-title">
          <h2 className="h3">Target hari ini · semua jenis konten</h2>
          <span className="muted">{longDate(office.date)}</span>
        </div>
        <TargetTiles office={office} />
        <p className="target-total">
          Tercapai <b className="mono">{total(office.progress)}</b>
          <span className="muted"> / {targetTotal || "–"} posting</span>
          {targetTotal > 0 && total(office.progress) >= targetTotal && (
            <span className="chip t-ok">Semua target tercapai</span>
          )}
        </p>
        <p className="muted">
          Manajer menyusun jam posting sendiri, memposting konten siap sesuai
          Rencana konten sosmed, dan menyuruh tim memproduksi bila stok kurang.
          Posting dari menu Jadwal (manual) tidak dihitung ke target ini.
        </p>
      </section>

      <TargetForm office={office} onSaved={reload} onConfigure={onConfigure} />

      <Checklist office={office} />

      <section className="card pad stack">
        <h2 className="h3">Jadwal Manajer hari ini</h2>
        {active.length ? (
          <div className="manager-plan">
            {active.map((t) => (
              <div key={t.id} className="manager-plan-type">
                <div className="manager-plan-head">
                  <b>{t.name}</b>
                  <button
                    className="btn btn-sec btn-sm"
                    onClick={() => onConfigure(t.id)}
                  >
                    Rencana konten
                  </button>
                </div>
                {PLATFORMS.filter((p) => t.targets[p] > 0).map((p) => (
                  <div key={p} className="manager-plan-row">
                    <span className="manager-plan-platform">
                      {PLATFORM_LABEL[p]}
                      <small className="muted mono">
                        {t.today[p]}/{t.targets[p]}
                      </small>
                    </span>
                    <span className="manager-slots">
                      {t.manager[p].slots.map((s, i) => (
                        <span
                          key={i}
                          className={"chip chip-xs " + SLOT_TONE[s.status]}
                          title={`${hhmm(s.at)} · ${SLOT_LABEL[s.status]}`}
                        >
                          {hhmm(s.at)} · {SLOT_LABEL[s.status]}
                        </span>
                      ))}
                    </span>
                    <small
                      className={
                        /Stok/.test(
                          nextLabel(t.manager[p], t.today[p], t.targets[p]),
                        )
                          ? "warn"
                          : "muted"
                      }
                    >
                      {nextLabel(t.manager[p], t.today[p], t.targets[p])}
                    </small>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">
            Belum ada target. Isi tabel Target harian di atas, lalu Manajer
            mulai bekerja.
          </p>
        )}
      </section>

      <div className="manager-columns">
        <section className="card pad stack">
          <h2 className="h3">Perintah ke tim</h2>
          {orders.length ? (
            <ul className="manager-list">
              {orders.map((o) => (
                <li key={o.typeId + ":" + o.chapterId + ":" + o.at}>
                  <span
                    className={
                      "chip chip-xs " +
                      (o.status === "berjalan"
                        ? "t-run"
                        : o.status === "selesai"
                          ? "t-ok"
                          : "t-block")
                    }
                  >
                    {o.status}
                  </span>
                  <span>
                    <b>{o.title}</b>
                    <small className="muted">
                      {" "}
                      · {o.typeName} · {o.reason}
                    </small>
                    {o.note && <small className="warn"> · {o.note}</small>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Belum ada perintah produksi hari ini.</p>
          )}
        </section>
        <section className="card pad stack">
          <h2 className="h3">Catatan Manajer</h2>
          {log.length ? (
            <ul className="manager-list">
              {log.slice(0, 15).map((l, i) => (
                <li key={i}>
                  <span className="mono muted">{clock(l.at)}</span>
                  <span
                    className={
                      l.tone === "warn"
                        ? "warn"
                        : l.tone === "ok"
                          ? "ok-text"
                          : ""
                    }
                  >
                    {l.text}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Manajer belum mencatat apa pun.</p>
          )}
        </section>
      </div>

      <section className="card pad stack">
        <h2 className="h3">Posting oleh Manajer · 7 hari terakhir</h2>
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>Tanggal</th>
                {PLATFORMS.map((p) => (
                  <th key={p} className="num">
                    {PLATFORM_LABEL[p]}
                  </th>
                ))}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {[...office.history].reverse().map((h) => (
                <tr
                  key={h.date}
                  className={h.date === office.date ? "is-today" : ""}
                >
                  <td>
                    {h.date === office.date ? "Hari ini" : shortDate(h.date)}
                  </td>
                  {PLATFORMS.map((p) => (
                    <td key={p} className="num mono">
                      {h[p]}
                    </td>
                  ))}
                  <td className="num mono">{total(h)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type ZAccount = { id: string; username: string; platform: string };

export function SosmedCenter({
  types,
  instagram,
  onConfigure,
  onOpenStats,
}: {
  types: ContentType[];
  instagram: InstagramConnection;
  onConfigure: (type: ContentType) => void;
  onOpenStats?: () => void;
}) {
  const { office, error } = useOffice(20000);
  const [accounts, setAccounts] = useState<ZAccount[]>([]);
  useEffect(() => {
    api("/zernio/accounts", "GET", undefined, null)
      .then((c) => setAccounts(c.accounts ?? []))
      .catch(() => setAccounts([]));
  }, []);
  const accountName = (platform: string, id: string | null) => {
    if (platform === "instagram") {
      const list = instagram.accounts ?? [];
      const a = id
        ? list.find((x) => x.id === id)
        : list.length === 1
          ? list[0]
          : null;
      return a ? "@" + a.username : id ? "akun tersimpan" : "akun utama NC-WA";
    }
    const a = accounts.find((x) => x.id === id);
    return a ? "@" + a.username : id ? "akun tersimpan" : "";
  };
  const planned = types;
  const officeType = (id: number) => office?.types.find((t) => t.id === id);
  return (
    <div className="stack-lg office-page">
      <section className="card pad stack">
        <div className="card-title">
          <h2 className="h3">Target posting hari ini · semua jenis konten</h2>
          <span className="row-gap">
            {office && <span className="muted">{longDate(office.date)}</span>}
            {onOpenStats && (
              <button className="btn btn-sec btn-sm" onClick={onOpenStats}>
                Statistik akun
              </button>
            )}
          </span>
        </div>
        {office ? (
          <TargetTiles office={office} />
        ) : (
          <p className="muted">{error || "Memuat…"}</p>
        )}
      </section>
      <section className="card pad stack">
        <div className="card-title">
          <h2 className="h3">Aturan konten tiap sosmed</h2>
          <span className="muted">
            Konten dan target diatur di Pengaturan Konten
          </span>
        </div>
        <div className="table">
          <table className="social-matrix">
            <thead>
              <tr>
                <th>Jenis konten</th>
                {PLAN_PLATFORMS.map((p) => (
                  <th key={p}>{PLATFORM_LABEL[p]}</th>
                ))}
                <th aria-label="Aksi" />
              </tr>
            </thead>
            <tbody>
              {planned.map((t) => {
                const ot = officeType(t.id);
                return (
                  <tr key={t.id}>
                    <td>
                      <b>{t.name}</b>
                    </td>
                    {socialPlan(t.outputs, t.settings, t.engine).map((row) => (
                      <td key={row.platform}>
                        {row.active ? (
                          <div className="social-cell">
                            <span>
                              {row.posts.length ? row.posts.join(" + ") : "—"}
                            </span>
                            <small className="muted">
                              {accountName(row.platform, row.accountId)}
                            </small>
                            {ot && ot.targets[row.platform] > 0 && (
                              <small
                                className={
                                  ot.today[row.platform] >=
                                  ot.targets[row.platform]
                                    ? "ok-text"
                                    : "muted"
                                }
                              >
                                Manajer: {ot.today[row.platform]}/
                                {ot.targets[row.platform]} hari ini
                              </small>
                            )}
                            {row.problems.map((p) => (
                              <small key={p} className="warn">
                                {p}
                              </small>
                            ))}
                          </div>
                        ) : (
                          <span className="muted">Tidak aktif</span>
                        )}
                      </td>
                    ))}
                    <td>
                      <button
                        className="btn btn-sec btn-sm"
                        onClick={() => onConfigure(t)}
                      >
                        Atur
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!planned.length && (
                <tr>
                  <td colSpan={5} className="muted">
                    Belum ada jenis konten.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card pad stack">
        <h2 className="h3">Posting terbaru</h2>
        {office?.recent.length ? (
          <ul className="recent-posts">
            {office.recent.map((r, i) => (
              <li key={i}>
                <span className="mono muted">{clock(r.at)}</span>
                <span className="chip chip-xs t-none">
                  {PLATFORM_LABEL[r.platform]}
                </span>
                <span className="recent-title">
                  {r.kind} · {r.title}
                  {r.typeName && (
                    <small className="muted"> · {r.typeName}</small>
                  )}
                </span>
                <span className="chip chip-xs t-none">
                  {r.byManager ? "Manajer" : "Manual"}
                </span>
                <span
                  className={"chip chip-xs " + (r.sent ? "t-ok" : "t-block")}
                >
                  {postLabel(r)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Belum ada posting dalam 7 hari terakhir.</p>
        )}
      </section>
    </div>
  );
}
