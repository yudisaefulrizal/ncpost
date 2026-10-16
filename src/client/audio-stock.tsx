import React, { useEffect, useState } from "react";
import { api } from "./api";
type Audio = {
  canDownload: boolean;
  id: number;
  text: string;
  provider: string;
  voice: string;
  voiceName: string;
  url: string;
};
type ZipJob = {
  id: string;
  status: "running" | "done" | "failed";
  done: number;
  total: number;
  failed: string[];
  error?: string;
  size?: number;
  expiresAt?: number;
};
const fileSize = (size: number) => {
  const gb = size >= 1024 ** 3;
  return (
    (size / 1024 ** (gb ? 3 : 2)).toLocaleString("id-ID", {
      maximumFractionDigits: 1,
    }) + (gb ? " GB" : " MB")
  );
};
export function AudioStockPage() {
  const [items, setItems] = useState<Audio[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState("");
  const [voice, setVoice] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [job, setJob] = useState<ZipJob | null>(null);
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await api("/audio-stock", "GET", undefined, null));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // ZIP yang disiapkan sebelumnya tetap bisa diunduh setelah tab ditutup.
    api("/audio-stock/download", "GET", undefined, null)
      .then(setJob)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (job?.status !== "running") return;
    const timer = setTimeout(() => {
      api("/audio-stock/download", "GET", undefined, null)
        .then((next: ZipJob | null) => {
          if (!next)
            setError(
              "Server dimulai ulang sebelum ZIP selesai. Klik download lagi.",
            );
          setJob(next);
        })
        // Gangguan jaringan sesaat: coba lagi pada putaran berikutnya.
        .catch(() => setJob({ ...job }));
    }, 1000);
    return () => clearTimeout(timer);
  }, [job]);
  const running = job?.status === "running";
  const filtered = items.filter(
    (row) =>
      (!provider || row.provider === provider) &&
      (!voice || `${row.provider}__${row.voice}` === voice) &&
      (!q.trim() ||
        `${row.text} ${row.voiceName} ${row.voice}`
          .toLowerCase()
          .includes(q.trim().toLowerCase())),
  );
  const downloadable = filtered.filter((row) => row.canDownload);
  const chosen = downloadable.filter((row) => selected.includes(row.id));
  const allSelected =
    downloadable.length > 0 && chosen.length === downloadable.length;
  const voices = [
    ...new Map(
      items
        .filter((row) => !provider || row.provider === provider)
        .map((row) => [`${row.provider}__${row.voice}`, row.voiceName]),
    ).entries(),
  ];
  const download = async (onlySelected: boolean) => {
    setBusy(true);
    setError("");
    try {
      setJob(
        await api(
          "/audio-stock/download",
          "POST",
          {
            q,
            provider,
            voice,
            ...(onlySelected ? { ids: chosen.map((row) => row.id) } : {}),
          },
          null,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card pad stack">
      <div className="card-title">
        <div>
          <h2 className="h3">Stok Audio</h2>
          <p className="muted">
            {filtered.length} audio · {chosen.length} dipilih
          </p>
        </div>
        <button
          className="btn btn-sec"
          disabled={loading || busy}
          onClick={() => void load()}
        >
          Perbarui
        </button>
      </div>
      <div className="voice-form-grid">
        <label className="field">
          Cari audio
          <input
            value={q}
            placeholder="Cari teks atau suara"
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label className="field">
          Penyedia
          <select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setVoice("");
            }}
          >
            <option value="">Semua penyedia</option>
            {[...new Set(items.map((row) => row.provider))].map((p) => (
              <option key={p} value={p}>
                {p === "elevenlabs"
                  ? "ElevenLabs"
                  : p === "edge-tts"
                    ? "Edge TTS"
                    : p}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Suara
          <select value={voice} onChange={(e) => setVoice(e.target.value)}>
            <option value="">Semua suara</option>
            {voices.map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="toolbar">
        <button
          className="btn btn-pri"
          disabled={busy || running || !chosen.length}
          onClick={() => void download(true)}
        >
          Download terpilih ({chosen.length})
        </button>
        <button
          className="btn btn-sec"
          disabled={busy || running || !downloadable.length}
          onClick={() => void download(false)}
        >
          Download semua hasil filter ({downloadable.length})
        </button>
        <button
          className="btn btn-sec"
          disabled={!selected.length || busy}
          onClick={() => setSelected([])}
        >
          Batal pilih
        </button>
      </div>
      {running && (
        <div className="banner t-run" role="status">
          <span>
            Menyiapkan ZIP: {job.done}/{job.total} audio dikonversi. Halaman
            boleh ditutup; ZIP tetap disiapkan di server.
          </span>
          <div className="bar audio-zip-bar">
            <span
              className="bg-ok"
              style={{ width: `${(job.done / job.total) * 100}%` }}
            ></span>
          </div>
        </div>
      )}
      {job?.status === "done" && (
        <div className="banner t-ok" role="status">
          <span>
            ZIP siap: {job.total - job.failed.length} file WAV ·{" "}
            {fileSize(job.size ?? 0)} · tersedia sampai{" "}
            {new Date(job.expiresAt ?? 0).toLocaleTimeString("id-ID", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <a
            className="btn btn-pri btn-sm"
            href="/api/audio-stock/download/file"
            download
          >
            Unduh ZIP
          </a>
        </div>
      )}
      {job?.status === "failed" && (
        <p className="warn" role="alert">
          {job.error}
        </p>
      )}
      {!!job?.failed.length && (
        <details>
          <summary className="warn">
            {job.failed.length} audio gagal dikonversi dan dilewati
          </summary>
          <ul className="small">
            {job.failed.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </details>
      )}
      <small className="muted">
        Download dalam format WAV, PCM 16-bit, mono, 44,1 kHz. Nama file memakai
        teks narasi. Audio dengan teks lebih dari 230 karakter tidak ikut
        diunduh.
      </small>
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      <div className="table">
        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Pilih seluruh hasil filter"
                  checked={allSelected}
                  disabled={!downloadable.length}
                  onChange={(e) =>
                    setSelected((old) =>
                      e.target.checked
                        ? [
                            ...new Set([
                              ...old,
                              ...downloadable.map((row) => row.id),
                            ]),
                          ]
                        : old.filter(
                            (id) => !filtered.some((row) => row.id === id),
                          ),
                    )
                  }
                />
              </th>
              <th>Teks</th>
              <th>Suara</th>
              <th>Audio</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Pilih audio: ${row.text}`}
                    disabled={!row.canDownload}
                    checked={selected.includes(row.id)}
                    onChange={(e) =>
                      setSelected((old) =>
                        e.target.checked
                          ? [...old, row.id]
                          : old.filter((id) => id !== row.id),
                      )
                    }
                  />
                </td>
                <td className="audio-stock-text">{row.text}</td>
                <td>
                  {row.voiceName}
                  <small className="muted"> · {row.provider}</small>
                </td>
                <td>
                  <audio controls preload="none" src={row.url} />
                </td>
                <td>
                  {row.canDownload ? (
                    <a
                      className="btn btn-sec btn-sm"
                      href={`${row.url}?download=1`}
                    >
                      Download
                    </a>
                  ) : (
                    <small className="muted">
                      Teks lebih dari 230 karakter — dilewati
                    </small>
                  )}
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={5}>
                  {loading ? "Memuat audio…" : "Tidak ada audio yang sesuai."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
