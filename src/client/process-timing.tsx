import React, { useEffect, useState } from "react";
import { api } from "./api";
import {
  TIMING_STAGES,
  type ProcessTiming,
  type TimingStage,
  timingEta,
} from "../server/process-timing-domain";
const duration = (ms: number) => {
  const seconds = Math.ceil(ms / 1000);
  return seconds < 60
    ? `${seconds} detik`
    : `${Math.floor(seconds / 60)} menit ${seconds % 60} detik`;
};
const dateLabel = (ms: number) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
export function ProcessTimingPanel({ mode }: { mode: "history" | "eta" }) {
  const [history, setHistory] = useState<ProcessTiming[]>([]);
  const [eta, setEta] = useState<ReturnType<typeof timingEta>>([]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState("");
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [stage, setStage] = useState<TimingStage>("article");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api("/process-timings", "GET", undefined, null);
      setHistory(data.history);
      setEta(data.eta);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function apply(key: TimingStage) {
    setBusy(key);
    setError("");
    setMessage("");
    try {
      await api("/process-timings/eta", "POST", { stage: key }, null);
      setMessage(
        `Estimasi ${TIMING_STAGES.find(([s]) => s === key)![1]} diterapkan ke Guide.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const filtered = history.filter((row) => row.stage === stage);
  return (
    <div className="process-timing-panel">
      <div className="guide-heading">
        <div>
          <h2 className="h3">
            {mode === "history" ? "Histori proses" : "ETA proses"}
          </h2>
          <p className="muted">
            {mode === "history"
              ? "Maksimal 20 proses terbaru per jenis, lintas semua konten. Data paling lama otomatis dihapus."
              : "Rekomendasi durasi dari persentil ke-90 proses berhasil pada 20 histori terbaru per jenis."}
          </p>
        </div>
        <button
          className="btn btn-sec"
          disabled={loading || !!busy}
          onClick={() => void load()}
        >
          {loading ? <span className="spinner" /> : null} Perbarui
        </button>
      </div>
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="cron-shift-result">
          {message}
        </p>
      )}
      {loading ? (
        <p className="lab-run-status">
          <span className="spinner" />
          Memuat data proses…
        </p>
      ) : mode === "history" ? (
        <>
          <div
            className="timing-stage-tabs"
            role="tablist"
            aria-label="Jenis histori"
          >
            {TIMING_STAGES.map(([key, label]) => (
              <button
                key={key}
                role="tab"
                id={`timing-${key}-tab`}
                aria-selected={stage === key}
                aria-controls="timing-history-panel"
                onClick={() => setStage(key)}
              >
                {label}
                <span className="cron-count">
                  {history.filter((row) => row.stage === key).length}/20
                </span>
              </button>
            ))}
          </div>
          <div
            id="timing-history-panel"
            role="tabpanel"
            aria-labelledby={`timing-${stage}-tab`}
          >
            <div className="table">
              <table className="timing-history-table">
                <thead>
                  <tr>
                    <th>Konten</th>
                    <th>Proses</th>
                    <th>Selesai · WIB</th>
                    <th>Durasi</th>
                    <th>Hasil</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.title || `Job #${row.job_id}`}
                        <small className="guide-note">
                          {row.source === "book"
                            ? "Konten"
                            : row.source === "news"
                              ? "Artikel berita"
                              : "Produksi berita"}{" "}
                          · #{row.job_id} · percobaan {row.attempt}
                        </small>
                      </td>
                      <td>{row.kind}</td>
                      <td>{dateLabel(row.finished_at)}</td>
                      <td>{duration(row.duration_ms)}</td>
                      <td>
                        <span
                          className={`queue-state queue-state-${row.status}`}
                        >
                          {row.status === "completed" ? "Berhasil" : "Gagal"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!filtered.length && (
              <div className="timing-empty">
                Belum ada histori. Durasi mulai dicatat pada proses produksi
                berikutnya.
              </div>
            )}
          </div>
          <p className="muted guide-estimate">
            Durasi satu pekerjaan lengkap, termasuk seluruh panel gambar yang
            diproses. Waktu tunggu antrean tidak dihitung. Render panel dari
            gambar yang sudah ada tidak masuk estimasi generate gambar.
          </p>
        </>
      ) : (
        <>
          <div className="table">
            <table className="timing-eta-table">
              <thead>
                <tr>
                  <th>Jenis proses</th>
                  <th>Data berhasil</th>
                  <th>P90 aktual</th>
                  <th>Rekomendasi Guide</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {eta.map((item) => (
                  <tr key={item.stage}>
                    <td>{item.label}</td>
                    <td>{item.samples} data</td>
                    <td>{item.p90Ms === null ? "—" : duration(item.p90Ms)}</td>
                    <td>
                      {item.minutes === null
                        ? "Belum tersedia"
                        : `${item.minutes} menit`}
                    </td>
                    <td>
                      <button
                        className="btn btn-sec"
                        disabled={
                          !!busy || item.minutes === null || item.minutes > 1440
                        }
                        onClick={() => void apply(item.stage)}
                      >
                        {busy === item.stage ? (
                          <>
                            <span className="spinner" /> Menerapkan…
                          </>
                        ) : (
                          "Gunakan di Guide"
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted guide-estimate">
            P90 mencakup sekitar 90% durasi yang teramati. Rekomendasi
            dibulatkan ke atas dalam menit; proses gagal tidak ikut perhitungan.
            Jeda tambahan tetap mengikuti Guide.
          </p>
        </>
      )}
    </div>
  );
}
