import { ImageUploads, imageAttachments, uploadLabImage } from "./lab-uploads";
import { Modal } from "./modal";
import React, { useEffect, useState } from "react";
type Kind = "article" | "image";
type Reference = {
  id: string;
  name: string;
  prompt: string;
  orientation: string;
};
type Draft = {
  id: number;
  name: string;
  prompt: string;
  reference_key?: string | null;
  reference_image?: string | null;
  logo_image?: string | null;
  reference_images?: string | null;
};
type Run = {
  id: number;
  name: string;
  state: string;
  prompt?: string;
  reference_key?: string | null;
  reference_image?: string | null;
  logo_image?: string | null;
  reference_images?: string | null;
  resolved_prompt?: string | null;
  input?: string;
  orientation?: string;
  error?: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  result?: { text?: string; image?: boolean; width?: number; height?: number };
};
const states: Record<string, string> = {
  queued: "Menunggu",
  running: "Berjalan",
  completed: "Selesai",
  failed: "Gagal",
};
async function api(route: string, method = "GET", body?: unknown) {
  const response = await fetch("/api/lab" + route, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Operasi Lab gagal");
  return data;
}
function PreviewIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
export function PromptLab({ kind }: { kind: Kind }) {
  const label = kind === "article" ? "Artikel" : "Gambar";
  const [references, setReferences] = useState<Reference[]>([]);
  const [referenceKey, setReferenceKey] = useState("");
  const [tab, setTab] = useState<"test" | "status">("test");
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [name, setName] = useState(`Eksperimen ${label.toLowerCase()}`);
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [orientation, setOrientation] = useState("bebas");
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [selected, setSelected] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const payload = {
    kind,
    name,
    prompt,
    input: "",
    orientation,
    referenceKey,
    referenceImages: attachments,
  };
  useEffect(() => {
    setEditing(false);
    setSelectedId(null);
    let current = true;
    Promise.all([
      api(`/prompts?kind=${kind}`),
      api(`/runs?kind=${kind}`),
      api(`/references?kind=${kind}`),
    ])
      .then(([p, r, refs]) => {
        if (current) {
          setReferences(refs);
          if (refs[0]) useReference(refs[0]);
          setDrafts(p);
          setRuns(r);
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [kind]);
  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    let current = true;
    setSelected(null);
    setPreviewError("");
    api(`/runs/${selectedId}`)
      .then((r) => {
        if (current) setSelected(r);
      })
      .catch((e) => {
        if (current) setPreviewError(e.message);
      });
    return () => {
      current = false;
    };
  }, [selectedId]);
  useEffect(() => {
    if (!runs.some((r) => r.state === "queued" || r.state === "running"))
      return;
    let current = true;
    const timer = setInterval(() => {
      Promise.all([
        api(`/runs?kind=${kind}`),
        selectedId ? api(`/runs/${selectedId}`) : Promise.resolve(null),
      ])
        .then(([r, detail]) => {
          if (current) {
            setRuns(r);
            if (detail) setSelected(detail);
          }
        })
        .catch((e) => {
          if (current) setError(e.message);
        });
    }, 3000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [
    kind,
    selectedId,
    runs.some((r) => r.state === "queued" || r.state === "running"),
  ]);
  async function action(run: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await run();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function upload(files: File[]) {
    void action(async () => {
      if (attachments.length + files.length > 8)
        throw Error("Maksimal 8 gambar lampiran");
      // Keep successful uploads selected even if a later file fails.
      for (const file of files) {
        const id = await uploadLabImage(file);
        setAttachments((current) => [...current, id]);
      }
    });
  }
  function useReference(ref: Reference) {
    setDraftId(null);
    setAttachments([]);
    setReferenceKey(ref.id);
    setName(ref.name);
    setPrompt(ref.prompt);
    setOrientation(ref.orientation);
    setMessage("");
  }
  function newDraft() {
    setDraftId(null);
    setAttachments([]);
    setReferenceKey("");
    setName("");
    setPrompt("");
    setOrientation("bebas");
    setMessage("");
    setEditing(true);
  }
  return (
    <div className="stack-lg">
      <div
        className="seg"
        role="tablist"
        aria-label={`Halaman Lab Prompt ${label}`}
      >
        <button
          role="tab"
          aria-selected={tab === "test"}
          className={tab === "test" ? "on" : ""}
          onClick={() => setTab("test")}
        >
          Uji prompt
        </button>
        <button
          role="tab"
          aria-selected={tab === "status"}
          className={tab === "status" ? "on" : ""}
          onClick={() => setTab("status")}
        >
          Status dan riwayat
        </button>
      </div>
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {tab === "test" && (
        <section className="card queue">
          <div className="card-head">
            <h2>Lab Prompt {label}</h2>
            <button
              className="btn btn-pri btn-sm"
              disabled={!references.length}
              onClick={newDraft}
            >
              Tambah jenis
            </button>
          </div>
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Jenis</th>
                  <th>Acuan</th>
                  <th>Status</th>
                  <th>Contoh hasil</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...references.map((ref) => ({
                    key: `ref-${ref.id}`,
                    name: ref.name,
                    prompt: ref.prompt,
                    reference: ref.id,
                    draft: null as Draft | null,
                  })),
                  ...drafts.map((d) => ({
                    key: `draft-${d.id}`,
                    name: d.name,
                    prompt: d.prompt,
                    reference: d.reference_key || "",
                    draft: d,
                  })),
                ].map((row) => {
                  const matching = runs.filter(
                    (r) =>
                      r.reference_key === (row.reference || null) &&
                      r.prompt === row.prompt &&
                      JSON.stringify(imageAttachments(r)) ===
                        JSON.stringify(
                          row.draft ? imageAttachments(row.draft) : [],
                        ) &&
                      (!row.draft || r.name === row.name),
                  );
                  const latest = matching[0];
                  const example = matching.find((r) => r.state === "completed");
                  return (
                    <tr key={row.key}>
                      <td>{row.name}</td>
                      <td>
                        {references.find((r) => r.id === row.reference)?.name ||
                          "Kustom"}
                      </td>
                      <td>
                        {latest
                          ? states[latest.state] || latest.state
                          : "Belum diuji"}
                      </td>
                      <td>
                        <button
                          className="btn btn-sec btn-sm"
                          disabled={!example}
                          title={
                            example
                              ? "Lihat contoh hasil"
                              : "Belum ada hasil pengujian"
                          }
                          aria-label={`Lihat contoh hasil ${row.name}`}
                          onClick={() => example && setSelectedId(example.id)}
                        >
                          <PreviewIcon />
                        </button>
                      </td>
                      <td>
                        <div className="toolbar">
                          <button
                            className="btn btn-pri btn-sm"
                            disabled={
                              busy ||
                              matching.some(
                                (r) =>
                                  r.state === "queued" || r.state === "running",
                              )
                            }
                            onClick={() =>
                              void action(async () => {
                                await api("/runs", "POST", {
                                  kind,
                                  name: row.name,
                                  prompt: row.prompt,
                                  referenceKey: row.reference,
                                  input: "",
                                  referenceImages: row.draft
                                    ? imageAttachments(row.draft)
                                    : [],
                                  orientation:
                                    references.find(
                                      (r) => r.id === row.reference,
                                    )?.orientation || "bebas",
                                });
                                setRuns(await api(`/runs?kind=${kind}`));
                                setMessage(
                                  `Pengujian ${row.name} masuk antrean`,
                                );
                              })
                            }
                          >
                            Uji
                          </button>
                          <button
                            className="btn btn-sec btn-sm"
                            onClick={() => {
                              if (row.draft) {
                                setDraftId(row.draft.id);
                                setAttachments(imageAttachments(row.draft));
                                setName(row.name);
                                setPrompt(row.prompt);
                                setReferenceKey(row.reference);
                                setOrientation(
                                  references.find((r) => r.id === row.reference)
                                    ?.orientation || "bebas",
                                );
                              } else {
                                const ref = references.find(
                                  (r) => r.id === row.reference,
                                );
                                if (ref) {
                                  useReference(ref);
                                  setName(`${ref.name} baru`);
                                }
                              }
                              setEditing(true);
                            }}
                          >
                            {row.draft ? "Edit" : "Tuning"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {editing && (
        <Modal
          title={draftId ? "Edit jenis" : "Tambah jenis"}
          onClose={() => {
            if (!busy) setEditing(false);
          }}
        >
          <div className="stack">
            {error && (
              <p className="warn" role="alert">
                {error}
              </p>
            )}
            <label className="field">
              Nama jenis
              <input
                value={name}
                maxLength={190}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            {kind === "article" && (
              <label className="field">
                Ambil acuan (opsional)
                <select
                  value={referenceKey}
                  onChange={(e) => {
                    const ref = references.find((r) => r.id === e.target.value);
                    setReferenceKey(ref?.id || "");
                    if (ref) {
                      setPrompt(ref.prompt);
                      setOrientation(ref.orientation);
                    }
                  }}
                >
                  <option value="">Tanpa acuan</option>
                  {references.map((ref) => (
                    <option key={ref.id} value={ref.id}>
                      {ref.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              Prompt
              <textarea
                rows={12}
                maxLength={30000}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Tulis instruksi yang ingin diuji"
              />
            </label>
            {kind === "image" && (
              <ImageUploads
                images={attachments}
                busy={busy}
                onChange={setAttachments}
                onUpload={upload}
              />
            )}
            <div className="toolbar">
              <button
                className="btn btn-sec"
                disabled={busy || !name.trim() || !prompt.trim()}
                onClick={() =>
                  void action(async () => {
                    const r = await api(
                      draftId ? `/prompts/${draftId}` : "/prompts",
                      draftId ? "PUT" : "POST",
                      payload,
                    );
                    setDraftId(r.id);
                    setDrafts(await api(`/prompts?kind=${kind}`));
                    window.dispatchEvent(new Event("lab-prompts-changed"));
                    setMessage("Jenis disimpan");
                    setEditing(false);
                  })
                }
              >
                Simpan jenis
              </button>
            </div>
          </div>
        </Modal>
      )}
      {tab === "status" && (
        <section className="card queue">
          <div className="card-head">
            <h2>Status pengujian</h2>
            <button
              className="btn btn-sec btn-sm"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  setRuns(await api(`/runs?kind=${kind}`));
                  if (selectedId) setSelected(await api(`/runs/${selectedId}`));
                })
              }
            >
              Perbarui status
            </button>
          </div>
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Uji</th>
                  <th>Prompt</th>
                  <th>Status</th>
                  <th>Waktu</th>
                  <th>Hasil</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td>#{r.id}</td>
                    <td>{r.name}</td>
                    <td>{states[r.state] || r.state}</td>
                    <td>{new Date(r.created_at).toLocaleString("id-ID")}</td>
                    <td>
                      <button
                        className="btn btn-sec btn-sm"
                        aria-label={`Lihat hasil uji ${r.name}`}
                        onClick={() => setSelectedId(r.id)}
                      >
                        <PreviewIcon />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!runs.length && (
            <p className="empty">
              Belum ada pengujian. Jalankan uji prompt terlebih dahulu.
            </p>
          )}
        </section>
      )}
      {selectedId && (
        <Modal title="Contoh hasil" onClose={() => setSelectedId(null)}>
          {!selected ? (
            previewError ? (
              <p className="warn" role="alert">
                {previewError}
              </p>
            ) : (
              <p>Memuat hasil…</p>
            )
          ) : (
            <div className="stack">
              <div className="card-title">
                <h2 className="h3">
                  Hasil uji #{selected.id} · {selected.name}
                </h2>
                <span>{states[selected.state] || selected.state}</span>
              </div>
              {selected.state === "queued" && (
                <p>Menunggu worker menjalankan pengujian.</p>
              )}
              {selected.state === "running" && (
                <p>Pengujian sedang berjalan. Status diperbarui otomatis.</p>
              )}
              {selected.error && (
                <p className="warn" role="alert">
                  {selected.error}
                </p>
              )}
              {selected.result?.text && (
                <>
                  <article style={{ whiteSpace: "pre-wrap" }}>
                    {selected.result.text}
                  </article>
                  <a
                    className="btn btn-sec"
                    href={`data:text/markdown;charset=utf-8,${encodeURIComponent(selected.result.text)}`}
                    download={`lab-artikel-${selected.id}.md`}
                  >
                    Unduh artikel
                  </a>
                </>
              )}
              {selected.result?.image && (
                <>
                  <img
                    src={`/api/lab/runs/${selected.id}/image`}
                    alt={`Hasil uji ${selected.name}`}
                    style={{
                      maxWidth: "100%",
                      maxHeight: 700,
                      objectFit: "contain",
                    }}
                  />
                  <small>
                    {selected.result.width} × {selected.result.height}
                  </small>
                  <a
                    className="btn btn-sec"
                    href={`/api/lab/runs/${selected.id}/image`}
                    download={`lab-gambar-${selected.id}.jpg`}
                  >
                    Unduh gambar
                  </a>
                </>
              )}
              {imageAttachments(selected).length > 0 && (
                <details>
                  <summary>Gambar lampiran</summary>
                  {imageAttachments(selected).map((id, index) => (
                    <img
                      key={id}
                      src={`/api/lab/images/${id}`}
                      alt={`Lampiran ${index + 1}`}
                      style={{
                        maxWidth: "100%",
                        maxHeight: 180,
                        objectFit: "contain",
                      }}
                    />
                  ))}
                </details>
              )}
              <details>
                <summary>Prompt saat pengujian</summary>
                <pre style={{ whiteSpace: "pre-wrap" }}>
                  {selected.resolved_prompt || selected.prompt}
                </pre>
              </details>
              <button
                className="btn btn-sec"
                onClick={() => {
                  setDraftId(null);
                  setName(selected.name);
                  setAttachments(imageAttachments(selected));
                  setReferenceKey(selected.reference_key || "");
                  setPrompt(selected.prompt || "");
                  setOrientation(selected.orientation || "bebas");
                  setTab("test");
                  setSelectedId(null);
                  setEditing(true);
                }}
              >
                Gunakan sebagai draf baru
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
