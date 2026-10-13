import React, { useEffect, useState } from "react";
import { api } from "./api";

let estimateCache: { expires: number; value: Promise<number | null> } | null =
  null;
function imageEstimate() {
  if (!estimateCache || estimateCache.expires < Date.now()) {
    estimateCache = {
      expires: Date.now() + 60000,
      value: api("/image-timings", "GET", undefined, null)
        .then((data) =>
          Number.isFinite(data.averageMs) && data.averageMs > 0
            ? data.averageMs
            : null,
        )
        .catch(() => null),
    };
  }
  return estimateCache.value;
}
export function estimatedImageProgress(
  elapsed: number,
  estimate: number | null,
) {
  return estimate && estimate > 0
    ? Math.min(95, Math.max(0, (elapsed / estimate) * 100))
    : null;
}
export function RegenerateButton({
  jobId,
  disabled,
  onClick,
}: {
  jobId?: number | null;
  disabled?: boolean;
  onClick: () => void;
}) {
  const [estimate, setEstimate] = useState<number | null>(null);
  const [started, setStarted] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!jobId) return;
    let active = true;
    setStarted(null);
    setEstimate(null);
    void imageEstimate().then((ms) => {
      if (active) setEstimate(ms);
    });
    const refresh = async () => {
      try {
        const run = await api(`/lab/runs/${jobId}`, "GET", undefined, null);
        const timestamp = run.started_at
          ? new Date(run.started_at).getTime()
          : NaN;
        if (active)
          setStarted(
            run.state === "running" && Number.isFinite(timestamp)
              ? timestamp
              : null,
          );
      } catch {
        /* Parent handles job status errors. */
      }
    };
    void refresh();
    const statusTimer = setInterval(refresh, 3000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      clearInterval(statusTimer);
      clearInterval(clock);
    };
  }, [jobId]);
  const elapsed = started === null ? 0 : Math.max(0, now - started);
  const progress = estimatedImageProgress(elapsed, estimate);
  const overtime = estimate !== null && elapsed >= estimate;
  const label = !jobId
    ? "Buat ulang"
    : started === null
      ? "Menunggu antrean…"
      : overtime
        ? "Masih diproses…"
        : "Membuat ulang…";
  return (
    <div className="regenerate-control">
      <button
        className={`btn btn-sm regenerate-button${jobId ? " is-loading" : ""}`}
        disabled={disabled || !!jobId}
        onClick={onClick}
        aria-busy={!!jobId}
      >
        {jobId && (
          <span
            className={`regenerate-fill${started === null || progress === null ? " indeterminate" : ""}`}
            style={
              started !== null && progress !== null
                ? { width: `${progress}%` }
                : undefined
            }
            aria-hidden="true"
          />
        )}
        <span className="regenerate-label">{label}</span>
      </button>
      {jobId && started !== null && (
        <small
          className="muted"
          title="Perkiraan berdasarkan rata-rata histori per gambar, bukan progres aktual dari Codex"
        >
          {estimate === null
            ? "Estimasi belum tersedia"
            : overtime
              ? "Melewati estimasi waktu"
              : `Estimasi ${Math.max(1, Math.ceil((estimate - elapsed) / 60000))} menit lagi`}
        </small>
      )}
    </div>
  );
}
