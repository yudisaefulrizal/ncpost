import React, { useEffect, useState } from "react";
import { api } from "./api";
import { Modal } from "./modal";
import { useImageCatalog } from "./image-catalog";
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
  const catalog = useImageCatalog();
  const actionLabel = (kind: string) =>
    labels[kind] ||
    (kind.startsWith("LAB_")
      ? catalog.laneName(kind) === kind
        ? "Gambar Lab"
        : catalog.laneName(kind)
      : kind.replace(/^S_/, "").startsWith("IMAGE_")
        ? `Gambar · ${catalog.laneName(kind.replace(/^S_/, ""))}`
        : kind.replaceAll("_", " "));
  const [viewing, setViewing] = useState<QueueItem | null>(null);
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
      `${item.title} ${item.content_type} ${actionLabel(item.kind)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const paged = paginateRows(filtered, page);
  async function act(item: QueueItem, action: "cancel" | "retry") {
    if (
      action === "cancel" &&
      !window.confirm(
        `Batalkan ${actionLabel(item.kind)} untuk "${item.title}"?`,
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
    <section className="card pad stack queue-page">
      <div className="queue-page-heading">
        <h2 className="h3">Pekerjaan</h2>
        <span className="cron-count">{items.length}</span>
      </div>
      <div className="queue-filters">
        <div className="upcoming-search">
          <QueueIcon name="search" />
          <input
            aria-label="Cari antrean"
            placeholder="Cari konten atau aksi"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
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
          {loading ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <QueueIcon name="refresh" />
          )}{" "}
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
            <table className="queue-list-table">
              <thead>
                <tr>
                  <th>Konten</th>
                  <th>Jenis konten</th>
                  <th>Proses</th>
                  <th>Status</th>
                  <th>Masuk antrean</th>
                  <th className="right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {paged.items.map((item) => {
                  const key = `${item.source}:${item.id}`;
                  return (
                    <tr key={key}>
                      <td className="queue-title-cell">
                        <div className="queue-topic" title={item.title}>
                          {item.source === "book" &&
                          item.title.includes(" · ") ? (
                            <>
                              <span className="queue-context">
                                {item.title.split(" · ")[0]}
                              </span>
                              <strong>
                                {item.title.split(" · ").slice(1).join(" · ")}
                              </strong>
                            </>
                          ) : (
                            <strong>{item.title}</strong>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="queue-type-label">
                          {item.content_type}
                        </span>
                      </td>
                      <td className="queue-stage">{actionLabel(item.kind)}</td>
                      <td>
                        <span
                          className={`queue-state queue-state-${item.state}`}
                        >
                          {item.state === "running" && (
                            <span className="spinner" aria-hidden="true" />
                          )}
                          {states[item.state] || item.state}
                        </span>
                      </td>
                      <td>
                        {item.created_at ? (
                          <div className="cron-next">
                            <strong>
                              {new Date(item.created_at).toLocaleTimeString(
                                "id-ID",
                                {
                                  timeZone: "Asia/Jakarta",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}{" "}
                              <small>WIB</small>
                            </strong>
                            <span>
                              {new Date(item.created_at).toLocaleDateString(
                                "id-ID",
                                {
                                  timeZone: "Asia/Jakarta",
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                },
                              )}
                            </span>
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <div className="queue-row-actions">
                          <button
                            className={`btn btn-sec btn-sm queue-icon-btn ${item.error ? "queue-detail-error" : ""}`}
                            aria-label={
                              item.error
                                ? "Detail kegagalan"
                                : "Detail pekerjaan"
                            }
                            title={
                              item.error
                                ? "Lihat penyebab kegagalan"
                                : "Lihat detail pekerjaan"
                            }
                            onClick={() => setViewing(item)}
                          >
                            <QueueIcon name="info" />
                          </button>
                          {item.state === "queued" && (
                            <button
                              className="btn btn-sec btn-sm queue-icon-btn"
                              aria-label="Batalkan"
                              title="Batalkan pekerjaan"
                              disabled={!!busy}
                              onClick={() => void act(item, "cancel")}
                            >
                              {busy === key ? (
                                <span className="spinner" aria-hidden="true" />
                              ) : (
                                <QueueIcon name="cancel" />
                              )}
                            </button>
                          )}
                          {item.state === "failed" && !!item.can_retry && (
                            <button
                              className="btn btn-sec btn-sm queue-icon-btn"
                              aria-label="Coba ulang"
                              title="Coba ulang pekerjaan"
                              disabled={!!busy}
                              onClick={() => void act(item, "retry")}
                            >
                              {busy === key ? (
                                <span className="spinner" aria-hidden="true" />
                              ) : (
                                <QueueIcon name="refresh" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!paged.total && (
                  <tr>
                    <td colSpan={6} className="queue-empty">
                      Tidak ada pekerjaan
                      {state ? " dengan status ini" : " dalam antrean"}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="upcoming-footer">
            <small className="muted">
              {paged.total
                ? `Menampilkan ${(paged.page - 1) * 20 + 1}–${Math.min(paged.page * 20, paged.total)} dari ${paged.total} pekerjaan`
                : "0 pekerjaan"}
            </small>
            <div className="upcoming-pagination">
              <button
                className="btn btn-sec btn-sm cron-icon-btn"
                aria-label="Sebelumnya"
                title="Halaman sebelumnya"
                disabled={paged.page <= 1}
                onClick={() => setPage(paged.page - 1)}
              >
                <QueueIcon name="left" />
              </button>
              <span>
                {paged.page} / {paged.pages}
              </span>
              <button
                className="btn btn-sec btn-sm cron-icon-btn"
                aria-label="Berikutnya"
                title="Halaman berikutnya"
                disabled={paged.page >= paged.pages}
                onClick={() => setPage(paged.page + 1)}
              >
                <QueueIcon name="right" />
              </button>
            </div>
          </div>
        </>
      )}
      {viewing && (
        <Modal
          title={viewing.error ? "Detail kegagalan" : "Detail pekerjaan"}
          onClose={() => setViewing(null)}
        >
          <div className="stack">
            <h3 className="h3">{viewing.title}</h3>
            <div className="queue-detail-meta">
              <span className="queue-type-label">{viewing.content_type}</span>
              <span>{actionLabel(viewing.kind)}</span>
              <span className={`queue-state queue-state-${viewing.state}`}>
                {states[viewing.state] || viewing.state}
              </span>
            </div>
            {viewing.error && (
              <pre className="queue-error-box">{viewing.error}</pre>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}

function QueueIcon({
  name,
}: {
  name: "search" | "refresh" | "cancel" | "info" | "left" | "right";
}) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "search" ? (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 4 4" />
        </>
      ) : name === "refresh" ? (
        <>
          <path d="M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3a7 7 0 0 0 11.6-1" />
        </>
      ) : name === "cancel" ? (
        <path d="m6 6 12 12M6 18 18 6" />
      ) : name === "info" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7h.01" />
        </>
      ) : (
        <path d={name === "left" ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"} />
      )}
    </svg>
  );
}
