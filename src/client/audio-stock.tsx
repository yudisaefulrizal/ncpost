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
export function AudioStockPage() {
  const [items, setItems] = useState<Audio[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [provider, setProvider] = useState("");
  const [voice, setVoice] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
  }, []);
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
      const response = await fetch("/api/audio-stock/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q,
          provider,
          voice,
          ...(onlySelected ? { ids: chosen.map((row) => row.id) } : {}),
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw Error(data.error || "Download audio gagal");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "stok-audio.zip";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
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
          disabled={busy || !chosen.length}
          onClick={() => void download(true)}
        >
          Download terpilih ({chosen.length})
        </button>
        <button
          className="btn btn-sec"
          disabled={busy || !downloadable.length}
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
        {busy && <span role="status">Menyiapkan ZIP…</span>}
      </div>
      <small className="muted">
        Nama download memakai teks narasi. Audio dengan teks lebih dari 230
        karakter tidak ikut diunduh.
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
