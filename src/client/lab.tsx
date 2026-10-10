import { labConfig, type LabConfig } from "../server/lab-config";
import { ArticleConfigFields, defaultArticleConfig } from "./article-config";
import { LabVariables } from "./lab-variables";
import { api as projectApi } from "./api";
import { ImageUploads, imageAttachments, uploadLabImage } from "./lab-uploads";
import { Modal } from "./modal";
import React, { useEffect, useState } from "react";
type Kind = "article" | "image" | "quote";
type Reference = {
  id: string;
  name: string;
  prompt: string;
  orientation: string;
};
type Draft = {
  config?: string | null;
  image_type?: string;
  id: number;
  name: string;
  prompt: string;
  reference_key?: string | null;
  reference_image?: string | null;
  logo_image?: string | null;
  reference_images?: string | null;
};
type Run = {
  config?: string | null;
  image_type?: string;
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
function LabRunStatus({ state }: { state: string }) {
  return (
    <span
      className="lab-run-status"
      role={state === "running" ? "status" : undefined}
    >
      {state === "running" && <span className="spinner" aria-hidden="true" />}
      {states[state] || state}
    </span>
  );
}
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
  const label =
    kind === "article" ? "Artikel" : kind === "quote" ? "Quote" : "Gambar";
  const [references, setReferences] = useState<Reference[]>([]);
  const [referenceKey, setReferenceKey] = useState("");
  const [tab, setTab] = useState<"test" | "status">("test");
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [name, setName] = useState(`Eksperimen ${label.toLowerCase()}`);
  const [imageType, setImageType] = useState("illustration");
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
  const [config, setConfig] = useState<LabConfig | null>(null);
  const [examples, setExamples] = useState<
    {
      name: string;
      article: string;
      quote: boolean;
      context: string;
      topic: string;
    }[]
  >([]);
  useEffect(() => {
    let active = true;
    projectApi("/content-types")
      .then(async (types) => {
        const groups = await Promise.all(
          types.map(async (type: any) => ({
            type,
            rows: await projectApi(
              type.engine === "news" ? "/news" : "/chapters",
              "GET",
              undefined,
              type.id,
            ),
          })),
        );
        if (active)
          setExamples(
            groups.flatMap(({ type, rows }) =>
              rows
                .filter((row: any) => row.article)
                .map((row: any) => ({
                  name: `${type.name} · ${row.title || row.id}`,
                  article: row.article,
                  quote: type.engine === "quote",
                  context:
                    row.book || type.settings?.articleConfig?.context || "",
                  topic: row.title || "",
                })),
            ),
          );
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const payload = {
    kind,
    name,
    prompt,
    input: "",
    orientation,
    referenceKey,
    referenceImages: attachments,
    imageType,
    ...(config ? { config } : {}),
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
    setConfig(null);
    setImageType(ref.id.startsWith("QUOTE_") ? "ready_post" : "illustration");
    setDraftId(null);
    setAttachments([]);
    setReferenceKey(ref.id);
    setName(ref.name);
    setPrompt(ref.prompt);
    setOrientation(ref.orientation);
    setMessage("");
  }
  function newDraft() {
    setConfig(
      kind === "image"
        ? { usage: "single", unit: "article" }
        : { article: defaultArticleConfig("article") },
    );
    setImageType("illustration");
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
                  <th>{kind === "image" ? "Nama" : "Jenis"}</th>
                  {kind === "image" && <th>Jenis gambar</th>}
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
                    imageType: ref.id.startsWith("QUOTE_")
                      ? "ready_post"
                      : "illustration",
                    name: ref.name,
                    prompt: ref.prompt,
                    reference: ref.id,
                    draft: null as Draft | null,
                  })),
                  ...drafts.map((d) => ({
                    key: `draft-${d.id}`,
                    imageType: d.image_type || "illustration",
                    name: d.name,
                    prompt: d.prompt,
                    reference: d.reference_key || "",
                    draft: d,
                  })),
                ].map((row) => {
                  const matching = runs.filter(
                    (r) =>
                      (kind !== "image" ||
                        (r.image_type || "illustration") === row.imageType) &&
                      r.reference_key === (row.reference || null) &&
                      r.prompt === row.prompt &&
                      JSON.stringify(labConfig(r.config)) ===
                        JSON.stringify(labConfig(row.draft?.config)) &&
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
                      {kind === "image" && (
                        <td>
                          <span className="chip">
                            {row.imageType === "ready_post"
                              ? "Siap posting"
                              : row.imageType === "ready_video"
                                ? "Siap jadi video"
                                : "Ilustrasi"}
                          </span>
                        </td>
                      )}
                      <td>
                        {references.find((r) => r.id === row.reference)?.name ||
                          "Kustom"}
                      </td>
                      <td>
                        {latest ? (
                          <LabRunStatus state={latest.state} />
                        ) : (
                          "Belum diuji"
                        )}
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
                                  imageType: row.imageType,
                                  prompt: row.prompt,
                                  referenceKey: row.reference,
                                  input: "",
                                  ...(row.draft?.config
                                    ? { config: labConfig(row.draft.config) }
                                    : {}),
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
                                setConfig(labConfig(row.draft.config));
                                setDraftId(row.draft.id);
                                setImageType(row.imageType);
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
            <label className="check-row">
              <input
                type="checkbox"
                checked={!!config}
                onChange={(e) =>
                  setConfig(
                    e.target.checked
                      ? kind === "image"
                        ? { usage: "single", unit: "article" }
                        : {
                            article: defaultArticleConfig(
                              referenceKey || "article",
                            ),
                          }
                      : null,
                  )
                }
              />
              Form dengan variabel konten
            </label>
            {config && kind !== "image" && (
              <ArticleConfigFields
                value={
                  config.article ||
                  defaultArticleConfig(referenceKey || "article")
                }
                book={referenceKey === "book"}
                quote={referenceKey === "quote"}
                onChange={(article) => setConfig({ ...config, article })}
              />
            )}
            {config && kind === "image" && (
              <>
                <label className="field">
                  Penggunaan
                  <select
                    value={config.usage || "single"}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        usage: e.target.value as LabConfig["usage"],
                        unit:
                          e.target.value === "single"
                            ? "article"
                            : e.target.value === "video"
                              ? "sentence"
                              : "paragraph",
                      })
                    }
                  >
                    <option value="single">1 gambar</option>
                    <option value="carousel">Carousel</option>
                    <option value="video">Gambar video</option>
                  </select>
                </label>
                {config.usage !== "single" && (
                  <label className="field">
                    Unit gambar
                    <select
                      value={config.unit || "paragraph"}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          unit: e.target.value as LabConfig["unit"],
                        })
                      }
                    >
                      <option value="article">Seluruh artikel</option>
                      <option value="paragraph">Per paragraf</option>
                      <option value="sentence">Per kalimat</option>
                    </select>
                  </label>
                )}
                <label className="field">
                  Artikel contoh untuk Uji
                  <select
                    value={examples.findIndex(
                      (item) => item.article === config.sampleArticle,
                    )}
                    onChange={(e) => {
                      const example = examples[Number(e.target.value)];
                      setConfig({
                        ...config,
                        sampleArticle: example?.article,
                        sampleQuote: example?.quote,
                        sampleContext: example?.context,
                        sampleTopic: example?.topic,
                        testIndex: 1,
                      });
                    }}
                  >
                    <option value={-1}>Pilih artikel</option>
                    {examples.map((item, i) => (
                      <option key={i} value={i}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                {config.usage !== "single" && (
                  <label className="field">
                    Nomor unit uji
                    <input
                      type="number"
                      min={1}
                      value={config.testIndex || 1}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          testIndex: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                )}
              </>
            )}
            {kind === "image" && (
              <label className="field">
                Jenis gambar
                <select
                  aria-label="Jenis gambar"
                  value={imageType}
                  onChange={(e) => setImageType(e.target.value)}
                >
                  <option value="illustration">Ilustrasi</option>
                  <option value="ready_post">Siap posting</option>
                  <option value="ready_video">Siap jadi video</option>
                </select>
              </label>
            )}
            {kind === "image" && imageType === "ready_video" && (
              <label className="field">
                Rasio video
                <select
                  aria-label="Rasio video"
                  value={
                    orientation === "horizontal" ? "horizontal" : "vertikal"
                  }
                  onChange={(e) => setOrientation(e.target.value)}
                >
                  <option value="vertikal">9:16 · Vertikal</option>
                  <option value="horizontal">16:9 · Horizontal</option>
                </select>
              </label>
            )}
            {kind !== "image" && (
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
            <LabVariables
              image={kind === "image"}
              onInsert={(value) => setPrompt((current) => current + value)}
            />
            {config?.usage === "carousel" && kind === "image" && (
              <label className="field">
                Prompt halaman berikutnya
                <textarea
                  rows={8}
                  value={config.promptNext || ""}
                  onChange={(e) =>
                    setConfig({ ...config, promptNext: e.target.value })
                  }
                />
                <LabVariables
                  image
                  onInsert={(value) =>
                    setConfig({
                      ...config,
                      promptNext: (config.promptNext || "") + value,
                    })
                  }
                />
              </label>
            )}
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
                    <td>
                      <LabRunStatus state={r.state} />
                    </td>
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
                <LabRunStatus state={selected.state} />
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
                  setImageType(selected.image_type || "illustration");
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
