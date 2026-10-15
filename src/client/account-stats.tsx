// Halaman Statistik Akun: perkembangan harian follower, likes, dan views per akun.
// Instagram lewat NC-WA (diambil otomatis tiap jam, disimpan per hari WIB);
// TikTok/YouTube belum tersedia.
import React, { useEffect, useState } from "react";
import { api } from "./api";

type Point = {
  date: string;
  followers: number | null;
  followersDelta: number | null;
  likes: number | null;
  views: number | null;
  likesMonth: number | null;
  viewsMonth: number | null;
  unavailable: string[];
  fetchedAt: number;
  span: number;
};
type Account = {
  id: string;
  username: string;
  connected: boolean;
  latest: Point | null;
  series: Point[];
};
type Stats = {
  days: number;
  today: string;
  instagram: {
    available: true;
    state: string;
    reason: string;
    accounts: Account[];
  };
  tiktok: { available: false; reason: string };
  youtube: { available: false; reason: string };
};

const fmt = (n: number | null | undefined) =>
  n == null ? "–" : n.toLocaleString("id-ID");
const signed = (n: number | null) =>
  n == null ? "–" : (n > 0 ? "+" : "") + n.toLocaleString("id-ID");
const shortDate = (d: string) =>
  new Date(d + "T12:00:00+07:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  });
const longDate = (d: string) =>
  new Date(d + "T12:00:00+07:00").toLocaleDateString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
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

/** Grafik kecil satu seri: garis (follower) atau batang (angka harian). */
function MiniChart({
  title,
  points,
  kind,
}: {
  title: string;
  points: { date: string; value: number | null; span?: number }[];
  kind: "line" | "bar";
}) {
  const W = 320,
    H = 120,
    padL = 4,
    padR = 4,
    top = 18,
    bottom = 18;
  const values = points
    .map((p) => p.value)
    .filter((v): v is number => v != null);
  if (values.length < (kind === "line" ? 2 : 1))
    return (
      <figure className="mini-chart">
        <figcaption>{title}</figcaption>
        <p className="muted mini-chart-empty">
          Belum cukup data. Grafik muncul setelah beberapa hari pengambilan.
        </p>
      </figure>
    );
  const max = Math.max(...values),
    min = kind === "bar" ? 0 : Math.min(...values);
  const range = max - min || 1;
  const n = points.length;
  const step = (W - padL - padR) / n;
  const x = (i: number) => padL + step * i + step / 2;
  const y = (v: number) => top + (H - top - bottom) * (1 - (v - min) / range);
  const base = H - bottom;
  const line = points
    .map((p, i) => (p.value == null ? null : `${x(i)},${y(p.value)}`))
    .filter(Boolean)
    .join(" ");
  const tip = (p: (typeof points)[number]) =>
    `${longDate(p.date)}: ${p.value == null ? "tidak ada data" : p.value.toLocaleString("id-ID")}${p.span && p.span > 1 ? ` (gabungan ${p.span} hari)` : ""}`;
  return (
    <figure className="mini-chart">
      <figcaption>
        {title}
        <span className="muted mono">
          {kind === "line" ? `${fmt(min)}–${fmt(max)}` : `maks ${fmt(max)}`}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${title}, ${n} hari, nilai ${fmt(min)} sampai ${fmt(max)}`}
      >
        <line
          x1={padL}
          x2={W - padR}
          y1={base}
          y2={base}
          className="mini-chart-axis"
        />
        {kind === "bar" ? (
          points.map((p, i) =>
            p.value == null ? null : (
              <rect
                key={p.date}
                className="mini-chart-bar"
                x={x(i) - Math.max(1, step / 2 - 1)}
                width={Math.max(2, step - 2)}
                y={Math.min(y(p.value), base - 1)}
                height={Math.max(1, base - y(p.value))}
                rx={Math.min(4, Math.max(1, step / 2 - 1))}
              />
            ),
          )
        ) : (
          <polyline className="mini-chart-line" points={line} fill="none" />
        )}
        {kind === "line" &&
          points.map((p, i) =>
            p.value == null ? null : (
              <circle
                key={p.date}
                className="mini-chart-dot"
                cx={x(i)}
                cy={y(p.value)}
                r={n > 40 ? 0 : 3}
              />
            ),
          )}
        {/* Area sentuh tiap hari untuk tooltip */}
        {points.map((p, i) => (
          <rect
            key={"hit" + p.date}
            className="mini-chart-hit"
            x={padL + step * i}
            width={step}
            y={0}
            height={H}
          >
            <title>{tip(p)}</title>
          </rect>
        ))}
        <text x={padL} y={H - 4} className="mini-chart-label">
          {shortDate(points[0].date)}
        </text>
        <text
          x={W - padR}
          y={H - 4}
          className="mini-chart-label"
          textAnchor="end"
        >
          {shortDate(points[n - 1].date)}
        </text>
      </svg>
    </figure>
  );
}

/** Deret tanggal lengkap (hari tanpa data tetap ditampilkan sebagai kosong). */
function fillDays(series: Point[], days: number, today: string) {
  const byDate = new Map(series.map((p) => [p.date, p]));
  const out: { date: string; point: Point | null }[] = [];
  const end = Date.parse(today);
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(end - i * 86400000).toISOString().slice(0, 10);
    out.push({ date, point: byDate.get(date) ?? null });
  }
  return out;
}

function AccountCard({
  a,
  days,
  today,
}: {
  a: Account;
  days: number;
  today: string;
}) {
  const p = a.latest;
  const filled = fillDays(a.series, days, today);
  const insightsMissing =
    !!p && (p.unavailable.includes("likes") || p.unavailable.includes("views"));
  return (
    <section className="card pad stack stats-account">
      <div className="card-title">
        <h3 className="h3">@{a.username}</h3>
        <span className="row-gap">
          {!a.connected && (
            <span className="chip t-act">Tidak terhubung di NC-WA</span>
          )}
          {p && (
            <span className="muted">Terakhir diambil {clock(p.fetchedAt)}</span>
          )}
        </span>
      </div>
      {!p ? (
        <p className="muted">
          Belum ada data. Statistik diambil otomatis tiap jam, atau tekan
          "Perbarui sekarang".
        </p>
      ) : (
        <>
          <div className="stats-kpis">
            <div className="stats-kpi">
              <span className="muted">Follower</span>
              <b className="mono">{fmt(p.followers)}</b>
              <small className="muted">
                {signed(p.followersDelta)} dari data sebelumnya
              </small>
            </div>
            <div className="stats-kpi">
              <span className="muted">Likes bulan ini</span>
              <b className="mono">{fmt(p.likesMonth)}</b>
              <small className="muted">{signed(p.likes)} hari ini</small>
            </div>
            <div className="stats-kpi">
              <span className="muted">Views bulan ini</span>
              <b className="mono">{fmt(p.viewsMonth)}</b>
              <small className="muted">{signed(p.views)} hari ini</small>
            </div>
          </div>
          {insightsMissing && (
            <p className="warn">
              Likes/views belum tersedia: akun Instagram ini perlu memberi izin
              insights di NC-WA.
            </p>
          )}
          <div className="stats-charts">
            <MiniChart
              title="Follower"
              kind="line"
              points={filled.map((d) => ({
                date: d.date,
                value: d.point?.followers ?? null,
              }))}
            />
            <MiniChart
              title="Likes per hari"
              kind="bar"
              points={filled.map((d) => ({
                date: d.date,
                value: d.point?.likes ?? null,
                span: d.point?.span,
              }))}
            />
            <MiniChart
              title="Views per hari"
              kind="bar"
              points={filled.map((d) => ({
                date: d.date,
                value: d.point?.views ?? null,
                span: d.point?.span,
              }))}
            />
          </div>
          <details>
            <summary>Rincian harian</summary>
            <div className="table">
              <table>
                <thead>
                  <tr>
                    <th>Tanggal</th>
                    <th className="num">Follower</th>
                    <th className="num">Perubahan</th>
                    <th className="num">Likes</th>
                    <th className="num">Views</th>
                  </tr>
                </thead>
                <tbody>
                  {[...a.series].reverse().map((d) => (
                    <tr key={d.date}>
                      <td>
                        {longDate(d.date)}
                        {d.span > 1 && (
                          <small className="muted">
                            {" "}
                            · gabungan {d.span} hari
                          </small>
                        )}
                      </td>
                      <td className="num mono">{fmt(d.followers)}</td>
                      <td className="num mono">{signed(d.followersDelta)}</td>
                      <td className="num mono">{fmt(d.likes)}</td>
                      <td className="num mono">{fmt(d.views)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

export function AccountStatsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const load = async (d = days) => {
    try {
      setData(await api(`/account-stats?days=${d}`, "GET", undefined, null));
    } catch (e: any) {
      setNote(e?.message || "Statistik tidak bisa dibaca");
    }
  };
  useEffect(() => {
    load(days);
  }, [days]);
  const refresh = async () => {
    setBusy(true);
    setNote("");
    try {
      const r = await api("/account-stats/refresh", "POST", {}, null);
      await load(days);
      setNote(
        r.errors?.length
          ? `Diperbarui ${r.saved} akun; gagal: ${r.errors.join("; ")}`
          : `Diperbarui ${r.saved} akun`,
      );
    } catch (e: any) {
      setNote(e?.message || "Gagal memperbarui");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack-lg">
      <div className="stats-bar">
        <div className="seg" role="group" aria-label="Rentang waktu">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              className={days === d ? "on" : ""}
              aria-pressed={days === d}
              onClick={() => setDays(d)}
            >
              {d} hari
            </button>
          ))}
        </div>
        <div className="row-gap">
          {note && (
            <span className="muted" role="status">
              {note}
            </span>
          )}
          <button className="btn btn-sec" disabled={busy} onClick={refresh}>
            {busy ? "Memperbarui…" : "Perbarui sekarang"}
          </button>
        </div>
      </div>
      <p className="muted stats-note">
        Diambil otomatis tiap jam dan disimpan satu data per hari (WIB). Likes
        dan views dari Instagram berupa total bulan berjalan; angka harian
        dihitung dari selisihnya.
      </p>

      <section className="stack">
        <h2 className="h3">Instagram</h2>
        {!data ? (
          <div className="card empty">Memuat statistik…</div>
        ) : data.instagram.state !== "connected" &&
          !data.instagram.accounts.length ? (
          <div className="card empty">
            NC-WA belum terhubung: {data.instagram.reason}
          </div>
        ) : data.instagram.accounts.length ? (
          data.instagram.accounts.map((a) => (
            <AccountCard key={a.id} a={a} days={data.days} today={data.today} />
          ))
        ) : (
          <div className="card empty">Belum ada akun Instagram di NC-WA.</div>
        )}
      </section>

      <div className="stats-unavailable">
        {(["tiktok", "youtube"] as const).map((p) => (
          <section key={p} className="card pad stack">
            <div className="card-title">
              <h2 className="h3">{p === "tiktok" ? "TikTok" : "YouTube"}</h2>
              <span className="chip t-none">Belum tersedia</span>
            </div>
            <p className="muted">
              {data?.[p].reason ??
                "Belum tersedia: statistik lewat Zernio memerlukan add-on Analytics berbayar."}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
