import React, { useEffect, useState } from "react";
import { api } from "./api";
import { paginateRows } from "./pagination";
import { CRON_TYPES } from "../server/cron";
import { NEWS_MEDIA_STAGES } from "../server/news-production-domain";
import type { QueueItem } from "../server/queue";
const states: Record<string, string> = {
  queued: "Menunggu",
  running: "Berjalan",
  failed: "Gagal",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};
const labels: Record<string, string> = Object.fromEntries([
  ...CRON_TYPES,
  ...NEWS_MEDIA_STAGES,
]);
export function QueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [state, setState] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const endpoint =
    "/queue" + (state ? "?" + new URLSearchParams({ state }) : "");
  async function load() {
    setItems(await api(endpoint, "GET", undefined, null));
  }
  useEffect(() => {
    let current = true,
      fetching = false;
    setLoading(true);
    const poll = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const data = await api(endpoint, "GET", undefined, null);
        if (current) {
          setItems(data);
          setError("");
        }
      } catch (e) {
        if (current) setError((e as Error).message);
      } finally {
        fetching = false;
        if (current) setLoading(false);
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 5000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [endpoint]);
  const filtered = items.filter(
    (item) =>
      (!type || String(item.content_type_id) === type) &&
      `${item.title} ${item.content_type} ${labels[item.kind] || item.kind}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const paged = paginateRows(filtered, page);
  async function act(item: QueueItem, action: "cancel" | "retry") {
    if (
      action === "cancel" &&
      !window.confirm(
        `Batalkan ${labels[item.kind] || item.kind} untuk "${item.title}"?`,
      )
    )
      return;
    const key = `${item.source}:${item.id}`;
    setBusy(key);
    setError("");
    try {
      await api(`/queue/${item.source}/${item.id}/${action}`, "POST", {}, null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="card pad stack">
      <div className="toolbar">
        <input
          aria-label="Cari antrean"
          placeholder="Cari konten atau aksi"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Jenis konten"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Semua jenis konten</option>
          {[
            ...new Map(
              items.map((i) => [i.content_type_id, i.content_type]),
            ).entries(),
          ].map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label="Status antrean"
          value={state}
          onChange={(e) => {
            setState(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Semua status</option>
          {Object.entries(states).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <button
          className="btn btn-sec"
          disabled={loading || !!busy}
          onClick={() => {
            setLoading(true);
            void load()
              .catch((e) => setError(e.message))
              .finally(() => setLoading(false));
          }}
        >
          Perbarui
        </button>
      </div>
      {error && (
        <p role="alert" className="warn">
          {error}
        </p>
      )}
      {loading && !items.length ? (
        <p className="lab-run-status">
          <span className="spinner" aria-hidden="true" />
          Memuat antrean…
        </p>
      ) : (
        <>
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Konten</th>
                  <th>Jenis konten</th>
                  <th>Aksi</th>
                  <th>Status</th>
                  <th>Masuk antrean</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {paged.items.map((item) => {
                  const key = `${item.source}:${item.id}`;
                  return (
                    <tr key={key}>
                      <td>{item.title}</td>
                      <td>{item.content_type}</td>
                      <td>
                        {labels[item.kind] ||
                          (item.kind.startsWith("LAB_")
                            ? "Gambar Lab"
                            : item.kind
                                .replace(/^S_/, "")
                                .replaceAll("_", " "))}
                      </td>
                      <td>
                        <span className="lab-run-status">
                          {item.state === "running" && (
                            <span className="spinner" aria-hidden="true" />
                          )}
                          {states[item.state] || item.state}
                        </span>
                        {item.error && (
                          <details>
                            <summary>Detail</summary>
                            <p>{item.error}</p>
                          </details>
                        )}
                      </td>
                      <td>
                        {item.created_at
                          ? new Date(item.created_at).toLocaleString("id-ID", {
                              timeZone: "Asia/Jakarta",
                            }) + " WIB"
                          : "—"}
                      </td>
                      <td>
                        {item.state === "queued" && (
                          <button
                            className="btn btn-sec btn-sm"
                            disabled={!!busy}
                            onClick={() => void act(item, "cancel")}
                          >
                            {busy === key ? "Membatalkan…" : "Batalkan"}
                          </button>
                        )}
                        {item.state === "failed" && !!item.can_retry && (
                          <button
                            className="btn btn-sec btn-sm"
                            disabled={!!busy}
                            onClick={() => void act(item, "retry")}
                          >
                            {busy === key ? "Mengantrekan…" : "Coba ulang"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!paged.total && (
                  <tr>
                    <td colSpan={6}>
                      Tidak ada pekerjaan
                      {state ? " dengan status ini" : " dalam antrean"}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="toolbar">
            <small className="muted">
              {paged.total} pekerjaan · hingga 500 hasil, pekerjaan aktif
              ditampilkan lebih dahulu
            </small>
            <button
              className="btn btn-sec btn-sm"
              disabled={paged.page <= 1}
              onClick={() => setPage(paged.page - 1)}
            >
              Sebelumnya
            </button>
            <span>
              {paged.page} / {paged.pages}
            </span>
            <button
              className="btn btn-sec btn-sm"
              disabled={paged.page >= paged.pages}
              onClick={() => setPage(paged.page + 1)}
            >
              Berikutnya
            </button>
          </div>
        </>
      )}
    </section>
  );
}
