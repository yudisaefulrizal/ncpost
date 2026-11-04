import React, { useEffect, useState } from "react";
import { api } from "./api";
import { Modal } from "./modal";
import type { ContentType } from "../server/content-type-domain";
import type { Chapter, Job } from "../server/store";

export function VideoVektorProduction({ type }: { type: ContentType }) {
  const [rows, setRows] = useState<Chapter[]>([]),
    [jobs, setJobs] = useState<Job[]>([]);
  const [title, setTitle] = useState(""),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [watching, setWatching] = useState<Chapter | null>(null);
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
  const enqueue = (row: Chapter, replace = false) =>
    call(`/chapters/${row.id}/jobs`, "POST", {
      kind: "VIDEO_KALIMAT_H",
      replace,
    });
  const latest = (row: Chapter) =>
    jobs.find((j) => j.chapter_id === row.id && j.kind === "VIDEO_KALIMAT_H");
  return (
    <section className="card pad stack">
      <h2>Video Vektor</h2>
      <p className="muted">
        1920×1080 · Naskah → narasi → animasi → video final. Jadwal produksi
        dapat diatur di menu Jadwal.
      </p>
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await call("/chapters", "POST", { title });
            setTitle("");
          });
        }}
      >
        <label className="field">
          Judul video
          <input
            required
            minLength={5}
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <button
          className="btn btn-pri"
          disabled={busy || title.trim().length < 5}
        >
          Tambah judul
        </button>
      </form>
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      <div className="table">
        <table>
          <thead>
            <tr>
              <th>Judul</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const job = latest(row),
                active = !!job && ["queued", "running"].includes(job.state);
              const result = row.sentence_video_h
                ? JSON.parse(row.sentence_video_h)
                : null;
              const label: Record<string, string> = {
                queued: "Menunggu",
                running: "Berjalan",
                completed: "Selesai",
                failed: "Gagal",
                cancelled: "Dihentikan",
              };
              return (
                <tr key={row.id}>
                  <td>{row.title}</td>
                  <td>
                    {job ? label[job.state] || job.state : "Belum diproduksi"}
                    {job?.error && <p className="warn">{job.error}</p>}
                  </td>
                  <td>
                    <div className="toolbar">
                      {active ? (
                        <button
                          className="btn btn-sec"
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              call(`/queue/book/${job.id}/cancel`, "POST"),
                            )
                          }
                        >
                          Stop
                        </button>
                      ) : (
                        <button
                          className="btn btn-pri"
                          disabled={
                            busy ||
                            (!!result &&
                              !["failed", "cancelled"].includes(
                                job?.state || "",
                              ))
                          }
                          onClick={() => void run(() => enqueue(row))}
                        >
                          {job && ["failed", "cancelled"].includes(job.state)
                            ? "Lanjutkan"
                            : "Buat video"}
                        </button>
                      )}
                      {result && (
                        <>
                          <button
                            className="btn btn-sec"
                            onClick={() => setWatching(row)}
                          >
                            Tonton & unduh
                          </button>
                          <button
                            className="btn btn-sec"
                            disabled={busy || active}
                            onClick={() => {
                              if (
                                confirm(
                                  `Buat ulang naskah dan video “${row.title}”?`,
                                )
                              )
                                void run(() => enqueue(row, true));
                            }}
                          >
                            Buat ulang
                          </button>
                        </>
                      )}
                      <button
                        className="btn btn-sec"
                        disabled={busy || active}
                        onClick={() => {
                          if (
                            confirm(
                              `Hapus judul “${row.title}” beserta hasil di ncpost?`,
                            )
                          )
                            void run(() =>
                              call(`/chapters/${row.id}`, "DELETE"),
                            );
                        }}
                      >
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={3}>Tambahkan judul video untuk mulai.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {watching && (
        <Modal title={watching.title} onClose={() => setWatching(null)}>
          <div className="stack">
            <video
              className="reels-player wide"
              style={{ width: "100%", aspectRatio: "16 / 9" }}
              controls
              src={`/api/video-kalimat-h/${watching.id}/video-h.mp4`}
            />
            <div className="toolbar">
              {[
                "video.mp4",
                "narasi.wav",
                "musik.wav",
                "audio-final.wav",
                "naskah.json",
                "subtitle.srt",
              ].map((name) => (
                <a
                  key={name}
                  className="btn btn-sec"
                  href={`/api/chapters/${watching.id}/video-vektor/${name}`}
                  download={name}
                >
                  {name}
                </a>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
