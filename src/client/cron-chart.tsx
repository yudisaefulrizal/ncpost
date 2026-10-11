import React, { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { CronOptimization } from "../server/cron-optimize-domain";
import { scheduleLabel } from "../server/cron-schedule";
import type { UpcomingCron } from "../server/cron-upcoming";
import { cronDistribution, minuteLabel, wibDate } from "./cron-distribution";
export function CronChart({
  items,
  loading,
  onRefresh,
}: {
  items: UpcomingCron[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [date, setDate] = useState(wibDate);
  const [interval, setInterval] = useState(10);
  const [type, setType] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [preview, setPreview] = useState<
    (CronOptimization & { revision: string }) | null
  >(null);
  const [optimizing, setOptimizing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [optimizationError, setOptimizationError] = useState("");
  const [message, setMessage] = useState("");
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(1100);
  useEffect(() => {
    const element = chartRef.current;
    if (!element) return;
    const resize = () =>
      setChartWidth(Math.max(320, Math.min(1100, element.clientWidth)));
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, [date]);
  async function optimize() {
    setOptimizing(true);
    setOptimizationError("");
    setMessage("");
    setPreview(null);
    try {
      setPreview(await api("/crons/optimize/preview", "POST", undefined, null));
      setSelected(null);
    } catch (e) {
      setOptimizationError((e as Error).message);
    } finally {
      setOptimizing(false);
    }
  }
  async function apply() {
    if (!preview) return;
    setApplying(true);
    setOptimizationError("");
    try {
      const result = await api(
        "/crons/optimize/apply",
        "POST",
        { revision: preview.revision },
        null,
      );
      setMessage(`${result.count} cronjob berhasil dioptimasi.`);
      setPreview(null);
      setSelected(null);
      onRefresh();
    } catch (e) {
      setOptimizationError((e as Error).message);
    } finally {
      setApplying(false);
    }
  }
  let buckets: ReturnType<typeof cronDistribution> = [],
    before: ReturnType<typeof cronDistribution> = [],
    error = "";
  try {
    buckets = cronDistribution(preview?.items || items, date, interval, type);
    if (preview)
      before = cronDistribution(preview.original, date, interval, type);
  } catch (e) {
    error = (e as Error).message;
  }
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const peak = Math.max(0, ...buckets.map((bucket) => bucket.count));
  const axisPeak = Math.max(peak, ...before.map((bucket) => bucket.count));
  const step = Math.max(1, Math.ceil(axisPeak / 4)),
    max = step * 4;
  const width = chartWidth,
    left = 40,
    top = 20,
    height = width < 600 ? 220 : 280,
    plot = width - left - 30;
  const xTicks = width < 600 ? 4 : 8;
  const active = selected === null ? undefined : buckets[selected];
  return (
    <div className="stack cron-chart">
      <div className="cron-chart-controls">
        <label className="field">
          Tanggal
          <input
            type="date"
            aria-label="Tanggal grafik"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSelected(null);
            }}
          />
        </label>
        <label className="field">
          Rentang waktu
          <select
            aria-label="Rentang waktu"
            value={interval}
            onChange={(e) => {
              setInterval(Number(e.target.value));
              setSelected(null);
            }}
          >
            {[5, 10, 15, 30, 60].map((value) => (
              <option key={value} value={value}>
                {value} menit
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Jenis konten
          <select
            aria-label="Jenis konten grafik"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setSelected(null);
            }}
          >
            <option value="">Semua jenis konten</option>
            {[
              ...new Map(
                items.map((item) => [item.contentTypeId, item.contentType]),
              ).entries(),
            ].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn btn-sec"
          disabled={loading || applying || optimizing}
          onClick={() => {
            setPreview(null);
            setSelected(null);
            onRefresh();
          }}
        >
          {loading ? "Memuat…" : "Perbarui"}
        </button>
        <button
          className="btn btn-pri"
          disabled={loading || optimizing || applying}
          onClick={() => void optimize()}
        >
          {optimizing && <span className="spinner" aria-hidden="true" />}{" "}
          {optimizing ? "Menghitung…" : "Optimasi"}
        </button>
      </div>
      {optimizationError && (
        <p className="warn" role="alert">
          {optimizationError}
        </p>
      )}
      {message && (
        <p role="status" className="cron-shift-result">
          {message}
        </p>
      )}
      {preview && (
        <div className="cron-optimization-preview">
          <div>
            <strong>Pratinjau optimasi · {preview.count} cronjob aktif</strong>
            <p className="muted">
              Semua jenis konten dihitung bersama. Frekuensi tetap; hari
              mingguan dapat bergeser saat melewati tengah malam. Slot memakai
              durasi dan jeda di Guide.
            </p>
          </div>
          <div className="cron-optimization-actions">
            <button
              className="btn btn-sec"
              disabled={applying}
              onClick={() => {
                setPreview(null);
                setSelected(null);
                setOptimizationError("");
              }}
            >
              Batal
            </button>
            <button
              className="btn btn-pri"
              disabled={applying}
              onClick={() => void apply()}
            >
              {applying && <span className="spinner" aria-hidden="true" />}{" "}
              {applying ? "Menerapkan…" : "Terapkan"}
            </button>
          </div>
        </div>
      )}
      {error ? (
        <p className="warn" role="alert">
          {error}
        </p>
      ) : (
        <>
          <div className="cron-chart-heading">
            <h2 className="h3">
              Jumlah eksekusi terjadwal <small>WIB</small>
            </h2>
            <div className="cron-chart-stats">
              <span>
                Total <strong>{total}</strong> eksekusi
              </span>
              <span>
                Puncak <strong>{peak}</strong> / {interval} menit
              </span>
            </div>
          </div>
          {preview && (
            <div className="cron-optimization-legend">
              <span>
                <i className="before" /> Jadwal sekarang
              </span>
              <span>
                <i className="after" /> Hasil optimasi
              </span>
            </div>
          )}
          <div className="cron-chart-scroll" ref={chartRef}>
            <svg
              viewBox={`0 0 ${width} ${height + 70}`}
              className="cron-chart-svg"
              role="group"
              aria-label={`Grafik ${total} eksekusi terjadwal pada ${date}, rentang ${interval} menit`}
            >
              {Array.from({ length: 5 }, (_, i) => {
                const y = top + height - (i * height) / 4;
                return (
                  <g key={i}>
                    <line
                      x1={left}
                      x2={left + plot}
                      y1={y}
                      y2={y}
                      className="cron-chart-grid"
                    />
                    <text x={left - 12} y={y + 4} textAnchor="end">
                      {i * step}
                    </text>
                  </g>
                );
              })}
              {before.map((bucket, index) => {
                const barWidth = plot / before.length;
                const barHeight = (bucket.count / max) * height;
                return bucket.count ? (
                  <rect
                    key={`before-${index}`}
                    className="cron-chart-before"
                    x={left + index * barWidth}
                    y={top + height - barHeight}
                    width={barWidth}
                    height={barHeight}
                  >
                    <title>
                      Jadwal sekarang · {minuteLabel(bucket.start)} ·{" "}
                      {bucket.count} eksekusi
                    </title>
                  </rect>
                ) : null;
              })}
              {buckets.map((bucket, index) => {
                const barWidth = plot / buckets.length;
                const barHeight = (bucket.count / max) * height;
                const label = `${minuteLabel(bucket.start)}–${minuteLabel(bucket.start + interval - 1)} WIB: ${bucket.count} eksekusi`;
                return (
                  <rect
                    key={index}
                    x={
                      left + index * barWidth + (preview ? barWidth * 0.25 : 1)
                    }
                    y={top + height - Math.max(3, barHeight)}
                    width={Math.max(1, preview ? barWidth * 0.5 : barWidth - 2)}
                    height={Math.max(3, barHeight)}
                    className={`cron-chart-bar ${selected === index ? "selected" : ""} ${bucket.count ? "" : "empty"}`}
                    tabIndex={bucket.count ? 0 : -1}
                    role="button"
                    aria-label={label}
                    onMouseEnter={() => setSelected(index)}
                    onFocus={() => setSelected(index)}
                    onClick={() => setSelected(index)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(index);
                      }
                    }}
                  >
                    <title>{label}</title>
                  </rect>
                );
              })}
              {Array.from({ length: xTicks + 1 }, (_, i) => (
                <text
                  key={i}
                  x={left + (i * plot) / xTicks}
                  y={top + height + 28}
                  textAnchor={
                    i === 0 ? "start" : i === xTicks ? "end" : "middle"
                  }
                >
                  {minuteLabel((i * 1440) / xTicks)}
                </text>
              ))}
            </svg>
          </div>
          {active && (
            <div className="cron-chart-detail" role="status">
              <strong>
                {minuteLabel(active.start)}–
                {minuteLabel(active.start + interval - 1)} WIB · {active.count}{" "}
                eksekusi
              </strong>
              {active.labels.map((label, index) => (
                <span key={index}>{label}</span>
              ))}
            </div>
          )}
          {!total && !loading && (
            <p className="muted">
              Tidak ada eksekusi terjadwal pada tanggal dan filter yang dipilih.
            </p>
          )}
          <small className="muted">
            Hanya cronjob aktif pada tanggal yang dipilih. Arahkan kursor atau
            pilih batang untuk melihat detail.
          </small>
          {preview && (
            <details className="cron-optimization-details">
              <summary>Lihat perubahan hari dan jam</summary>
              <div className="table">
                <table>
                  <thead>
                    <tr>
                      <th>Konten / proses</th>
                      <th>Sekarang</th>
                      <th>Hasil optimasi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.entries.map((entry, index) => (
                      <tr key={index}>
                        <td>
                          {entry.item.contentType} · {entry.item.label}
                        </td>
                        <td>{scheduleLabel(entry.item.cron?.schedule)}</td>
                        <td>{scheduleLabel(entry.schedule)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
