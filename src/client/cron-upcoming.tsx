import React, { useEffect, useState } from "react";
import { api } from "./api";
import { paginateRows } from "./pagination";
import type { UpcomingCron } from "../server/cron-upcoming";
export function UpcomingCronsPage() {
  const [items, setItems] = useState<UpcomingCron[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let current = true,
      fetching = false;
    setLoading(true);
    const load = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const data = await api("/cron-upcoming", "GET", undefined, null);
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
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [refresh]);
  const filtered = items.filter((c) =>
    `${c.contentType} ${c.label}`.toLowerCase().includes(search.toLowerCase()),
  );
  const paged = paginateRows(filtered, page);
  return (
    <section className="card pad stack cron-upcoming">
      <div className="upcoming-toolbar">
        <div className="cron-heading">
          <h2 className="h3">Jadwal aktif</h2>
          <span className="cron-count">{items.length}</span>
        </div>
        <div className="upcoming-controls">
          <div className="upcoming-search">
            <UpcomingIcon name="search" />
            <input
              aria-label="Cari cronjob"
              placeholder="Cari jenis konten atau aksi"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <button
            className="btn btn-sec"
            disabled={loading}
            onClick={() => setRefresh((v) => v + 1)}
          >
            {loading ? (
              <span className="spinner" aria-hidden="true" />
            ) : (
              <UpcomingIcon name="refresh" />
            )}{" "}
            Perbarui
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="warn">
          {error}
        </p>
      )}
      {loading && !items.length ? (
        <p className="lab-run-status">
          <span className="spinner" aria-hidden="true" />
          Memuat jadwal…
        </p>
      ) : (
        <>
          <div className="table">
            <table className="cron-table upcoming-table">
              <thead>
                <tr>
                  <th>Konten</th>
                  <th>Proses</th>
                  <th>Waktu berikutnya</th>
                </tr>
              </thead>
              <tbody>
                {paged.items.map((c) => (
                  <tr key={`${c.contentTypeId}:${c.id || c.kind}`}>
                    <td className="cron-content">{c.contentType}</td>
                    <td>{c.label}</td>
                    <td>
                      <div className="cron-next">
                        <strong>
                          {new Date(c.nextRun).toLocaleTimeString("id-ID", {
                            timeZone: "Asia/Jakarta",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          <small>WIB</small>
                        </strong>
                        <span>
                          {new Date(c.nextRun).toLocaleDateString("id-ID", {
                            timeZone: "Asia/Jakarta",
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        {c.nextRun <= Date.now() && (
                          <span className="upcoming-waiting">Menunggu</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!paged.total && (
                  <tr>
                    <td colSpan={3} className="cron-empty">
                      {search
                        ? "Tidak ada jadwal yang sesuai pencarian."
                        : "Belum ada cronjob aktif. Atur jadwal di submenu Cronjob jenis konten."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="upcoming-footer">
            <small className="muted">
              {paged.total
                ? `Menampilkan ${(paged.page - 1) * 20 + 1}–${Math.min(paged.page * 20, paged.total)} dari ${paged.total} jadwal`
                : "0 jadwal"}
            </small>
            <div className="upcoming-pagination">
              <button
                className="btn btn-sec btn-sm cron-icon-btn"
                aria-label="Sebelumnya"
                title="Halaman sebelumnya"
                disabled={paged.page <= 1}
                onClick={() => setPage(paged.page - 1)}
              >
                <UpcomingIcon name="left" />
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
                <UpcomingIcon name="right" />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function UpcomingIcon({
  name,
}: {
  name: "search" | "refresh" | "left" | "right";
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
      ) : (
        <path d={name === "left" ? "m14 6-6 6 6 6" : "m10 6 6 6-6 6"} />
      )}
    </svg>
  );
}
