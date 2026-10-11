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
    <section className="card pad stack">
      <div className="toolbar">
        <input
          aria-label="Cari cronjob"
          placeholder="Cari jenis konten atau aksi"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <button
          className="btn btn-sec"
          disabled={loading}
          onClick={() => setRefresh((v) => v + 1)}
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
          Memuat jadwal…
        </p>
      ) : (
        <>
          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Jenis konten</th>
                  <th>Aksi</th>
                  <th>Konten per putaran</th>
                  <th>Waktu berikutnya</th>
                </tr>
              </thead>
              <tbody>
                {paged.items.map((c) => (
                  <tr key={`${c.contentTypeId}:${c.kind}`}>
                    <td>{c.contentType}</td>
                    <td>{c.label}</td>
                    <td>{c.batchSize}</td>
                    <td>
                      {new Date(c.nextRun).toLocaleString("id-ID", {
                        timeZone: "Asia/Jakarta",
                      })}{" "}
                      WIB
                      {c.nextRun <= Date.now() && (
                        <small className="muted"> · Menunggu scheduler</small>
                      )}
                    </td>
                  </tr>
                ))}
                {!paged.total && (
                  <tr>
                    <td colSpan={4}>
                      {search
                        ? "Tidak ada jadwal yang sesuai pencarian."
                        : "Belum ada cronjob aktif. Atur jadwal di submenu Cronjob jenis konten."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="toolbar">
            <small className="muted">{paged.total} jadwal aktif</small>
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
