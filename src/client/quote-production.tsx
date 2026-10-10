import React, { useEffect, useState } from "react";
import { api } from "./api";
import { Modal } from "./modal";
import type { ContentType } from "../server/content-type-domain";
import type { Chapter } from "../server/store";
import { articleSentences } from "../server/domain";

export function QuoteProduction({
  type,
  icon,
}: {
  type: ContentType;
  icon: (
    name: "play" | "redo" | "eye" | "edit" | "trash" | "check",
  ) => React.ReactNode;
}) {
  const [rows, setRows] = useState<Chapter[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<{ row: Chapter; kind: string } | null>(null);
  const [editing, setEditing] = useState<Chapter | null>(null);
  const [text, setText] = useState("");
  const call = (url: string, method = "GET", body?: unknown) =>
    api(url, method, body, type.id);
  const load = async () => {
    const [items, attempts] = await Promise.all([
      call("/chapters"),
      call("/jobs"),
    ]);
    setRows(items);
    setJobs(attempts);
  };
  useEffect(() => {
    let active = true,
      pending = false;
    const reload = async () => {
      if (pending) return;
      pending = true;
      try {
        const [items, attempts] = await Promise.all([
          api("/chapters", "GET", undefined, type.id),
          api("/jobs", "GET", undefined, type.id),
        ]);
        if (active) {
          setRows(items);
          setJobs(attempts);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        pending = false;
      }
    };
    void reload();
    const timer = setInterval(() => void reload(), 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [type.id]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const stages = [
    ["ARTICLE", "Quote", "article"],
    ["POST_IMAGE", "1 gambar", "text_image"],
  ];
  const kinds = () => type.settings?.sentenceKinds.map((k) => "S_" + k) || [];
  const blocked = (row: Chapter) =>
    jobs.some(
      (j) => j.chapter_id === row.id && ["queued", "running"].includes(j.state),
    );
  const completed = (row: Chapter, kind: string, column: string) =>
    kind === "IMAGES_VIDEO"
      ? kinds().length > 0 &&
        kinds().every(
          (k) =>
            Number(row.stock_counts?.[k] || 0) >=
            articleSentences(row.article, "quote").length,
        ) &&
        !!row.article
      : !!(row as any)[column];
  const ready = (row: Chapter, kind: string) => {
    if (kind === "ARTICLE") return true;
    if (row.article_status !== "siap") return false;
    if (kind.startsWith("VIDEO_")) {
      const source = kind.endsWith("_H")
        ? type.settings?.sentenceVideoHKind
        : type.settings?.sentenceVideoKind;
      return (
        !!row.sentence_audio &&
        !!source &&
        Number(row.stock_counts?.["S_" + source] || 0) >=
          articleSentences(row.article, "quote").length
      );
    }
    return true;
  };
  const current = view && rows.find((row) => row.id === view.row.id);
  const manifest =
    current && view?.kind !== "ARTICLE" && view?.kind !== "IMAGES_VIDEO"
      ? JSON.parse(
          (current as any)[
            stages.find(([kind]) => kind === view.kind)?.[2] || ""
          ] || "null",
        )
      : null;
  return (
    <section className="card pad stack">
      <div>
        <button
          className="btn btn-pri"
          disabled={busy}
          onClick={() => void run(() => call("/chapters", "POST"))}
        >
          Tambah quote
        </button>
      </div>
      {error && (
        <p role="alert" className="warn">
          {error}
        </p>
      )}
      <div className="table">
        <table>
          <thead>
            <tr>
              <th>Konten</th>
              {stages.map(([kind, label]) => (
                <th key={kind}>{label}</th>
              ))}
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>Quote {row.part_number || row.id}</td>
                {stages.map(([kind, label, column]) => {
                  const done = completed(row, kind, column);
                  const active = jobs.some(
                    (j) =>
                      j.chapter_id === row.id &&
                      ["queued", "running"].includes(j.state) &&
                      (kind === "IMAGES_VIDEO"
                        ? kinds().includes(j.kind)
                        : j.kind === kind),
                  );
                  const failed = jobs.find(
                    (j) =>
                      j.chapter_id === row.id &&
                      (kind === "IMAGES_VIDEO"
                        ? kinds().includes(j.kind)
                        : j.kind === kind),
                  );
                  return (
                    <td key={kind}>
                      <div className="stage-cell">
                        {done && !active && (
                          <span
                            className="done"
                            aria-label={`${label} tersedia`}
                          >
                            {icon("check")}
                          </span>
                        )}
                        <button
                          className={done ? "play redo" : "play"}
                          title={
                            active
                              ? `${label} sedang diproses`
                              : done
                                ? `Buat ulang ${label}`
                                : failed?.state === "failed"
                                  ? failed.error
                                  : `Buat ${label}`
                          }
                          aria-label={`${done ? "Buat ulang" : "Buat"} ${label}: ${row.title}`}
                          disabled={busy || blocked(row) || !ready(row, kind)}
                          onClick={() => {
                            if (
                              done &&
                              !confirm(
                                `Buat ulang ${label} untuk "${row.title}"?`,
                              )
                            )
                              return;
                            void run(async () => {
                              for (const stage of kind === "IMAGES_VIDEO"
                                ? kinds()
                                : [kind])
                                await call(`/chapters/${row.id}/jobs`, "POST", {
                                  kind: stage,
                                  replace: done,
                                });
                            });
                          }}
                        >
                          {active ? (
                            <span className="spinner" />
                          ) : (
                            icon(done ? "redo" : "play")
                          )}
                        </button>
                        {done && kind !== "IMAGES_VIDEO" && (
                          <button
                            className="play redo"
                            title={`Lihat ${label}`}
                            aria-label={`Lihat ${label}: ${row.title}`}
                            onClick={() => setView({ row, kind })}
                          >
                            {icon("eye")}
                          </button>
                        )}
                        {kind === "ARTICLE" && row.article && (
                          <button
                            className="play redo"
                            title="Sunting quote"
                            onClick={() => {
                              setEditing(row);
                              setText(row.article);
                            }}
                          >
                            {icon("edit")}
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
                <td>
                  <button
                    className="btn btn-sec btn-sm"
                    title="Hapus quote"
                    disabled={busy || blocked(row)}
                    onClick={() => {
                      if (confirm(`Hapus quote "${row.title}"?`))
                        void run(() => call(`/chapters/${row.id}`, "DELETE"));
                    }}
                  >
                    {icon("trash")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <div className="empty">Belum ada quote.</div>}
      {view && current && (
        <Modal title={current.title} onClose={() => setView(null)}>
          {view.kind === "ARTICLE" ? (
            <p>{current.article}</p>
          ) : view.kind === "POST_IMAGE" ? (
            <img
              className="content-image-preview"
              src={`/api/text-image/${current.id}?v=${encodeURIComponent(manifest?.renderedAt || "")}`}
              alt={current.title}
            />
          ) : view.kind === "TTS_KALIMAT" ? (
            <div className="stack">
              {(manifest?.sentences || []).map((s: any, i: number) => (
                <audio
                  key={i}
                  controls
                  src={`/api/audio-kalimat/${current.id}/${s.file}`}
                />
              ))}
            </div>
          ) : (
            <video
              className={`reels-player ${view.kind.endsWith("_H") ? "wide" : "tall"}`}
              controls
              src={`/api/video-kalimat${view.kind.endsWith("_H") ? "-h" : ""}/${current.id}/${manifest?.file}?v=${encodeURIComponent(manifest?.renderedAt || "")}`}
            />
          )}
        </Modal>
      )}
      {editing && (
        <Modal title="Sunting quote" onClose={() => setEditing(null)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await call(`/chapters/${editing.id}`, "PUT", { article: text });
                setEditing(null);
              });
            }}
          >
            <textarea
              rows={6}
              required
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button className="btn btn-pri" disabled={busy}>
              Simpan
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
