// Lab Berita: tema global, link sumber rujukan, dan target harian Jurnalis per
// lab, plus riwayat link berita yang sudah dipakai (tidak pernah dipakai ulang).
import React, { useEffect, useState } from "react";
import { api } from "./api";
import type { NewsLab, NewsLabLink } from "../server/news-lab";

type Draft = { theme: string; sources: string; dailyTarget: number };
const empty: Draft = { theme: "", sources: "", dailyTarget: 3 };
const when = (ts: number) =>
  new Date(ts).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });

function labState(lab: NewsLab) {
  if (lab.state === "running")
    return { tone: "t-run", label: "Jurnalis mencari berita" };
  if (lab.state === "failed") return { tone: "t-act", label: "Gagal" };
  if (lab.today >= lab.dailyTarget)
    return { tone: "t-ok", label: "Target hari ini tercapai" };
  return { tone: "t-none", label: "Menunggu giliran" };
}

export function NewsLabPage() {
  const [labs, setLabs] = useState<NewsLab[]>([]);
  const [links, setLinks] = useState<NewsLabLink[]>([]);
  const [draft, setDraft] = useState<Draft>(empty);
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    const data = await api("/news-labs", "GET", undefined, null);
    setLabs(data.labs);
    setLinks(data.links);
  };
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    // Status Jurnalis berubah di worker; segarkan berkala.
    const timer = setInterval(() => void load().catch(() => {}), 15000);
    return () => clearInterval(timer);
  }, []);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack">
      <section className="card pad stack">
        <div className="card-title">
          <h2 className="h3">{editing ? "Ubah lab" : "Lab baru"}</h2>
          {editing && (
            <button
              className="btn btn-sec"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setDraft(empty);
              }}
            >
              Batal
            </button>
          )}
        </div>
        <p className="muted">
          Jurnalis mencari berita sesuai tema, hanya dari link sumber rujukan,
          sampai target per hari tercapai. Jenis konten Berita memilih lab di
          Pengaturan Berita (Sumber bahan: Lab Berita).
        </p>
        {error && (
          <p className="warn" role="alert">
            {error}
          </p>
        )}
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await api(
                editing ? `/news-labs/${editing}` : "/news-labs",
                editing ? "PUT" : "POST",
                {
                  theme: draft.theme,
                  sources: draft.sources.split(/[\s,]+/).filter(Boolean),
                  dailyTarget: draft.dailyTarget,
                },
                null,
              );
              setDraft(empty);
              setEditing(null);
              await load();
            });
          }}
        >
          <div className="voice-form-grid">
            <label className="field">
              Tema global
              <input
                required
                maxLength={190}
                placeholder="contoh: Teknologi"
                value={draft.theme}
                onChange={(e) => setDraft({ ...draft, theme: e.target.value })}
              />
            </label>
            <label className="field">
              Target berita per hari
              <input
                type="number"
                min={0}
                max={50}
                required
                value={draft.dailyTarget}
                onChange={(e) =>
                  setDraft({ ...draft, dailyTarget: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <label className="field">
            Link sumber rujukan
            <textarea
              rows={5}
              required
              placeholder={
                "satu link per baris, contoh:\nhttps://www.theverge.com/tech"
              }
              value={draft.sources}
              onChange={(e) => setDraft({ ...draft, sources: e.target.value })}
            />
          </label>
          <div>
            <button className="btn btn-pri" disabled={busy}>
              {busy
                ? "Memproses…"
                : editing
                  ? "Simpan perubahan"
                  : "Tambah lab"}
            </button>
          </div>
        </form>
      </section>

      <section className="card pad stack">
        <h2 className="h3">Daftar lab</h2>
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>Tema</th>
                <th>Sumber</th>
                <th>Hari ini</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {labs.map((lab) => {
                const st = labState(lab);
                return (
                  <tr key={lab.id}>
                    <td>{lab.theme}</td>
                    <td>{lab.sources.length} link</td>
                    <td>
                      {lab.today}/{lab.dailyTarget}
                      {lab.pending > 0 && (
                        <small className="muted">
                          {" "}
                          · {lab.pending} siap diproduksi
                        </small>
                      )}
                    </td>
                    <td>
                      <span className={`chip chip-xs ${st.tone}`}>
                        <i />
                        {st.label}
                      </span>
                      {lab.state === "failed" && lab.error && (
                        <small className="warn"> {lab.error}</small>
                      )}
                    </td>
                    <td>
                      <div className="toolbar">
                        <button
                          className="btn btn-sm"
                          disabled={busy}
                          onClick={() => {
                            setEditing(lab.id);
                            setDraft({
                              theme: lab.theme,
                              sources: lab.sources.join("\n"),
                              dailyTarget: lab.dailyTarget,
                            });
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-sm"
                          disabled={busy}
                          onClick={() =>
                            confirm(`Hapus lab ${lab.theme}?`) &&
                            void act(async () => {
                              await api(
                                `/news-labs/${lab.id}`,
                                "DELETE",
                                undefined,
                                null,
                              );
                              await load();
                            })
                          }
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!labs.length && (
                <tr>
                  <td colSpan={5}>Belum ada lab. Tambahkan lab untuk mulai.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card pad stack">
        <div className="card-title">
          <h2 className="h3">Berita terpakai</h2>
          <span className="muted">200 terbaru</span>
        </div>
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>Link</th>
                <th>Tanggal dipakai</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id}>
                  <td>
                    <a href={link.url} target="_blank" rel="noreferrer">
                      {link.url}
                    </a>
                  </td>
                  <td>{when(link.usedAt)}</td>
                </tr>
              ))}
              {!links.length && (
                <tr>
                  <td colSpan={2}>Belum ada berita yang dipakai.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
