import React, { useState } from "react";
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
  let buckets: ReturnType<typeof cronDistribution> = [],
    error = "";
  try {
    buckets = cronDistribution(items, date, interval, type);
  } catch (e) {
    error = (e as Error).message;
  }
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const peak = Math.max(0, ...buckets.map((bucket) => bucket.count));
  const step = Math.max(1, Math.ceil(peak / 4)),
    max = step * 4;
  const width = 1100,
    left = 40,
    top = 20,
    height = 280,
    plot = 1030;
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
        <button className="btn btn-sec" disabled={loading} onClick={onRefresh}>
          {loading ? "Memuat…" : "Perbarui"}
        </button>
      </div>
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
          <div className="cron-chart-scroll">
            <svg
              viewBox={`0 0 ${width} 350`}
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
              {buckets.map((bucket, index) => {
                const barWidth = plot / buckets.length;
                const barHeight = (bucket.count / max) * height;
                const label = `${minuteLabel(bucket.start)}–${minuteLabel(bucket.start + interval - 1)} WIB: ${bucket.count} eksekusi`;
                return (
                  <rect
                    key={index}
                    x={left + index * barWidth + 1}
                    y={top + height - Math.max(3, barHeight)}
                    width={Math.max(1, barWidth - 2)}
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
              {Array.from({ length: 9 }, (_, i) => (
                <text
                  key={i}
                  x={left + (i * plot) / 8}
                  y={top + height + 28}
                  textAnchor={i === 0 ? "start" : i === 8 ? "end" : "middle"}
                >
                  {minuteLabel(i * 180)}
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
        </>
      )}
    </div>
  );
}
