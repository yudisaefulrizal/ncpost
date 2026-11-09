import { ZernioCell } from "./publication-cell";
import { socialTargets } from "../server/book-settings";
import React, { useEffect, useState } from "react";
import { api } from "./api";
import { Modal } from "./modal";
import type { BookSettings } from "../server/book-settings";
import type { ContentType } from "../server/content-type-domain";
import type { Chapter, Job } from "../server/store";

const AGENT_LABEL: Record<string, string> = {
  codex: "Codex",
  claude: "Claude Code",
};
/** Pilihan agen pembuat dan gaya visual; dipakai semua video jenis ini, termasuk yang dijadwalkan. */
export function VideoVektorFields({
  settings,
  onChange,
}: {
  settings: BookSettings;
  onChange: (patch: Partial<BookSettings>) => void;
}) {
  const [options, setOptions] = useState<{
    styles: { id: string; name: string; description: string }[];
    agents: string[];
  } | null>(null);
  const [failed, setFailed] = useState("");
  useEffect(() => {
    let current = true;
    void api("/video-vektor/styles")
      .then((data) => current && setOptions(data))
      .catch((e) => current && setFailed((e as Error).message));
    return () => {
      current = false;
    };
  }, []);
  const style = options?.styles.find((s) => s.id === settings.vektorStyle);
  return (
    <>
      <label className="field">
        Agen pembuat video
        <select
          value={settings.vektorAgent || ""}
          onChange={(e) =>
            onChange({
              vektorAgent: (e.target.value || undefined) as
                | BookSettings["vektorAgent"],
            })
          }
        >
          <option value="">Bawaan server (VIDEO_VEKTOR_AGENT)</option>
          {(options?.agents ?? ["codex", "claude"]).map((a) => (
            <option key={a} value={a}>
              {AGENT_LABEL[a] || a}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Gaya visual
        <select
          value={settings.vektorStyle || ""}
          onChange={(e) =>
            onChange({ vektorStyle: e.target.value || undefined })
          }
        >
          <option value="">Bawaan mesin</option>
          {(options?.styles ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {style?.description && <span className="muted">{style.description}</span>}
        {failed && <span className="warn">{failed}</span>}
      </label>
    </>
  );
}
export function VideoVektorProduction({ type }: { type: ContentType }) {
  const [rows, setRows] = useState<Chapter[]>([]),
    [jobs, setJobs] = useState<Job[]>([]);
  const platforms = socialTargets(type.settings).filter(
    (p): p is "youtube" | "tiktok" => p === "youtube" || p === "tiktok",
  );
  const [accounts, setAccounts] = useState<
    { id: string; username: string; platform: string }[]
  >([]);
  useEffect(() => {
    let current = true;
    setAccounts([]);
    if (platforms.length)
      void api("/zernio/accounts", "GET", undefined, type.id)
        .then((data) => {
          if (current) setAccounts(data.accounts || []);
        })
        .catch(() => {
          /* Cells still report saved-account validation from the native API. */
        });
    return () => {
      current = false;
    };
  }, [
    type.id,
    type.settings?.youtubeAccountId,
    type.settings?.tiktokAccountId,
    platforms.join(","),
  ]);
  const accountFor = (platform: "youtube" | "tiktok") => {
    const id = type.settings?.[`${platform}AccountId`] || null;
    return accounts.find((a) => a.id === id && a.platform === platform)
      ?.username;
  };
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
    jobs.find(
      (j) =>
        j.chapter_id === row.id &&
        j.kind === "VIDEO_KALIMAT_H" &&
        j.revision === row.revision,
    );
  return (
    <section className="card pad stack">
      <h2>Video Vektor</h2>
      <p className="muted">
        1920×1080 · Naskah → narasi → animasi → video final. Agen:{" "}
        {AGENT_LABEL[type.settings?.vektorAgent || ""] || "bawaan server"} ·
        Gaya: {type.settings?.vektorStyle || "bawaan mesin"}. Ubah di
        Pengaturan Konten. Jadwal produksi dapat diatur di menu Jadwal.
      </p>
      {platforms.length ? (
        <p className="muted">
          Tujuan publikasi:{" "}
          {platforms
            .map(
              (p) =>
                `${p === "youtube" ? "YouTube" : "TikTok"}${accountFor(p) ? ` · @${accountFor(p)}` : type.settings?.[`${p}AccountId`] ? " · akun tersimpan" : " · pilih akun di Pengaturan Konten"}`,
            )
            .join("; ")}
          . Posting tersedia setelah video selesai.
        </p>
      ) : (
        <p className="muted">
          Pilih sosmed dan akun tujuan di Pengaturan Konten untuk menampilkan
          publikasi.
        </p>
      )}
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
              <th scope="col">Judul</th>
              <th scope="col">Status</th>
              {platforms.map((p) => (
                <th scope="col" key={p}>
                  {p === "youtube" ? "YouTube" : "TikTok"}
                </th>
              ))}
              <th scope="col">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const job = latest(row),
                active = !!job && ["queued", "running"].includes(job.state);
              let result: any = null;
              try {
                result = row.sentence_video_h
                  ? JSON.parse(row.sentence_video_h)
                  : null;
              } catch {}
              const available = !!result?.file && !result.deleted;
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
                    {job
                      ? label[job.state] || job.state
                      : result?.deleted
                        ? "Berkas dibersihkan"
                        : available
                          ? "Selesai"
                          : "Belum diproduksi"}
                    {job?.error && <p className="warn">{job.error}</p>}
                  </td>
                  {platforms.map((platform) => (
                    <td
                      key={`${platform}:${type.settings?.[`${platform}AccountId`] || ""}`}
                    >
                      <ZernioCell
                        source={`book:${row.id}`}
                        title={row.title}
                        platform={platform}
                        accountId={
                          type.settings?.[`${platform}AccountId`] || null
                        }
                        ready={available && !active}
                        blocked={busy || active}
                        detailed
                        scope={type.id}
                      />
                    </td>
                  ))}
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
                      {available && (
                        <button
                          className="btn btn-sec"
                          onClick={() => setWatching(row)}
                        >
                          Tonton & unduh
                        </button>
                      )}
                      {result && (
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
                <td colSpan={3 + platforms.length}>
                  Tambahkan judul video untuk mulai.
                </td>
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
