// Lab Berita: tema global dan link sumber rujukan per lab, plus riwayat link
// berita yang sudah dipakai (tidak pernah dipakai ulang). Jurnalis mencari berita
// terbaru saat produksi jenis konten yang memakai lab ini memanggilnya.
import React, { useEffect, useState } from "react";
import { api } from "./api";
import { Modal } from "./modal";
import type { NewsLab, NewsLabLink } from "../server/news-lab";

type Draft = { theme: string; sources: string; prompt: string };
const empty: Draft = { theme: "", sources: "", prompt: "" };
const when = (ts: number) =>
  new Date(ts).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });

function labState(lab: NewsLab) {
  if (!lab.enabled) return { tone: "t-block", label: "Nonaktif" };
  if (lab.state === "running")
    return { tone: "t-run", label: "Jurnalis mencari berita" };
  if (lab.state === "failed") return { tone: "t-act", label: "Gagal" };
  return { tone: "t-ok", label: "Siap dipanggil" };
}

export function NewsLabPage() {
  const [labs, setLabs] = useState<NewsLab[]>([]);
  const [links, setLinks] = useState<NewsLabLink[]>([]);
  const [draft, setDraft] = useState<Draft>(empty);
  // null = modal tertutup; "new" = tambah lab; angka = ubah lab itu.
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    const data = await api("/news-labs", "GET", undefined, null);
    setLabs(data.labs);
    setLinks(data.links);
  };
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  // Status Jurnalis berubah di worker; segarkan berkala, lebih sering saat Tes.
  const testing = labs.some((l) =>
    ["queued", "running"].includes(l.test?.state ?? ""),
  );
  useEffect(() => {
    const timer = setInterval(
      () => void load().catch(() => {}),
      testing ? 5000 : 15000,
    );
    return () => clearInterval(timer);
  }, [testing]);
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
  const close = () => {
    setEditing(null);
    setDraft(empty);
    setFormError("");
  };
  return (
    <div className="stack">
      {editing !== null && (
        <Modal
          title={editing === "new" ? "Tambah lab" : "Ubah lab"}
          onClose={close}
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              setFormError("");
              api(
                editing === "new" ? "/news-labs" : `/news-labs/${editing}`,
                editing === "new" ? "POST" : "PUT",
                {
                  theme: draft.theme,
                  sources: draft.sources.split(/[\s,]+/).filter(Boolean),
                  prompt: draft.prompt,
                },
                null,
              )
                .then(async () => {
                  close();
                  await load();
                })
                .catch((e) => setFormError((e as Error).message))
                .finally(() => setBusy(false));
            }}
          >
            {formError && (
              <p className="warn" role="alert">
                {formError}
              </p>
            )}
            <label className="field">
              Tema global
              <input
                autoFocus
                required
                maxLength={190}
                placeholder="contoh: Teknologi"
                value={draft.theme}
                onChange={(e) => setDraft({ ...draft, theme: e.target.value })}
              />
            </label>
            <label className="field">
              Link sumber rujukan
              <textarea
                rows={5}
                required
                placeholder={
                  "satu link per baris, contoh:\nhttps://www.theverge.com/tech"
                }
                value={draft.sources}
                onChange={(e) =>
                  setDraft({ ...draft, sources: e.target.value })
                }
              />
            </label>
            <label className="field">
              Prompt artikel
              <textarea
                rows={10}
                required
                maxLength={100000}
                placeholder="Instruksi penulisan artikel final, termasuk jumlah paragraf. Bisa memakai {{link_berita}} dan {{konteks}} (tema)."
                value={draft.prompt}
                onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
              />
            </label>
            <div className="toolbar">
              <button className="btn btn-pri" disabled={busy}>
                {busy
                  ? "Memproses…"
                  : editing === "new"
                    ? "Tambah lab"
                    : "Simpan perubahan"}
              </button>
              <button
                type="button"
                className="btn btn-sec"
                disabled={busy}
                onClick={close}
              >
                Batal
              </button>
            </div>
          </form>
        </Modal>
      )}

      <section className="card pad stack">
        <div className="card-title">
          <h2 className="h3">Daftar lab</h2>
          <button
            className="btn btn-pri"
            disabled={busy}
            onClick={() => {
              setDraft(empty);
              setEditing("new");
            }}
          >
            Tambah lab
          </button>
        </div>
        <p className="muted">
          Tiap lab menghasilkan artikel final sendiri. Saat produksi jenis
          konten yang memakai lab ini membuat artikel, Jurnalis memilih satu
          berita paling baru saat itu sesuai tema, hanya dari link sumber
          rujukan, lalu menulis artikelnya dengan prompt lab. Jadwal dan jumlah
          produksi diatur di jenis kontennya (Pengaturan Berita, Sumber bahan:
          Lab Berita). Lab nonaktif tidak bisa dipakai; Tes menampilkan berita
          dan artikel hasilnya tanpa mencatatnya.
        </p>
        {error && (
          <p className="warn" role="alert">
            {error}
          </p>
        )}
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>Tema</th>
                <th>Sumber</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {labs.map((lab) => {
                const st = labState(lab);
                const test = lab.test;
                const testBusy = ["queued", "running"].includes(
                  test?.state ?? "",
                );
                return (
                  <React.Fragment key={lab.id}>
                    <tr>
                      <td>{lab.theme}</td>
                      <td>{lab.sources.length} link</td>
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
                                prompt: lab.prompt,
                              });
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-sm"
                            disabled={busy}
                            onClick={() =>
                              void act(async () => {
                                await api(
                                  `/news-labs/${lab.id}/enabled`,
                                  "PUT",
                                  { enabled: !lab.enabled },
                                  null,
                                );
                                await load();
                              })
                            }
                          >
                            {lab.enabled ? "Nonaktifkan" : "Aktifkan"}
                          </button>
                          <button
                            className="btn btn-sm"
                            disabled={busy || testBusy}
                            onClick={() =>
                              void act(async () => {
                                await api(
                                  `/news-labs/${lab.id}/test`,
                                  "POST",
                                  undefined,
                                  null,
                                );
                                await load();
                              })
                            }
                          >
                            {testBusy ? "Menguji…" : "Tes"}
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
                    {test && (
                      <tr>
                        <td colSpan={4}>
                          <div className="stack">
                            <small className="muted">
                              Tes
                              {test.at ? ` · ${when(test.at)}` : ""} ·{" "}
                              {test.state === "queued"
                                ? "menunggu Jurnalis"
                                : test.state === "running"
                                  ? "Jurnalis mencari berita dan menulis artikel…"
                                  : test.state === "failed"
                                    ? "gagal"
                                    : "berita dan artikel tidak dicatat"}
                            </small>
                            {test.error && (
                              <small className="warn">{test.error}</small>
                            )}
                            {test.links.length > 0 && (
                              <ol>
                                {test.links.map((url) => (
                                  <li key={url}>
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {url}
                                    </a>
                                  </li>
                                ))}
                              </ol>
                            )}
                            {test.article && (
                              <details>
                                <summary>Lihat artikel hasil Tes</summary>
                                <pre className="news-lab-article">
                                  {test.article}
                                </pre>
                              </details>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {!labs.length && (
                <tr>
                  <td colSpan={4}>Belum ada lab. Tambahkan lab untuk mulai.</td>
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
