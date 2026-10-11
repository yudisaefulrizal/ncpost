import React, { useEffect, useState } from "react";
import { api } from "./api";
import { paginateRows } from "./pagination";
import type { UpcomingCron } from "../server/cron-upcoming";
import { CronTable } from "./cron-settings";
import { ContentTypeContext } from "./content-types";
import { contentAllows, type ContentType } from "../server/content-type-domain";
import { CRON_TYPES } from "../server/cron";
import { NEWS_CRON_TYPES } from "../server/news-production-domain";
import { scheduleLabel } from "../server/cron-schedule";
const cronStages = (type: ContentType) =>
  (type.engine === "news" ? NEWS_CRON_TYPES : CRON_TYPES).filter(([kind]) =>
    contentAllows(type, kind),
  );
export function UpcomingCronsPage() {
  const [types, setTypes] = useState<ContentType[]>([]);
  const [selected, setSelected] = useState<ContentType | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<UpcomingCron | null>(null);
  const [busy, setBusy] = useState("");
  async function edit(item: UpcomingCron) {
    setBusy(`${item.contentTypeId}:${item.id}`);
    try {
      const available: ContentType[] = await api(
        "/content-types",
        "GET",
        undefined,
        null,
      );
      const type = available.find((t) => t.id === item.contentTypeId);
      if (!type) throw Error("Jenis konten tidak ditemukan");
      setEditing(item);
      setSelected(type);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function remove(item: UpcomingCron) {
    if (
      !window.confirm(`Hapus cronjob ${item.label} untuk ${item.contentType}?`)
    )
      return;
    setBusy(`${item.contentTypeId}:${item.id}`);
    try {
      await api(
        item.engine === "news" ? "/news-crons" : "/book-crons",
        "DELETE",
        { id: item.id },
        item.contentTypeId,
      );
      setRefresh((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function add() {
    setEditing(null);
    setAdding(true);
    setError("");
    try {
      const available: ContentType[] = await api(
        "/content-types",
        "GET",
        undefined,
        null,
      );
      const eligible = available.filter((type) => cronStages(type).length);
      if (!eligible.length)
        throw Error(
          "Tambahkan jenis konten dan atur target output terlebih dahulu.",
        );
      setTypes(eligible);
      setSelected(eligible[0]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }
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
        const data = await api("/crons", "GET", undefined, null);
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
          <h2 className="h3">Semua cronjob</h2>
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
          <button
            className="btn btn-pri"
            disabled={adding}
            onClick={() => void add()}
          >
            {adding && <span className="spinner" aria-hidden="true" />} Tambah
            Cronjob
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
            <table className="cron-table global-cron-table">
              <thead>
                <tr>
                  <th>Konten</th>
                  <th>Proses</th>
                  <th>Jadwal</th>
                  <th>Status</th>
                  <th>Waktu berikutnya</th>
                  <th className="right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {paged.items.map((c) => (
                  <tr key={`${c.contentTypeId}:${c.id || c.kind}`}>
                    <td className="cron-content">{c.contentType}</td>
                    <td>{c.label}</td>
                    <td>
                      {c.cron?.schedule
                        ? scheduleLabel(c.cron.schedule)
                        : `Setiap ${c.cron?.intervalHours || 24} jam`}
                    </td>
                    <td>
                      <span
                        className={`queue-state ${c.cron?.enabled ? "queue-state-completed" : "queue-state-cancelled"}`}
                      >
                        {c.cron?.enabled ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td>
                      {c.cron?.enabled && c.nextRun !== null ? (
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
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <div className="cron-actions">
                        <button
                          className="btn btn-sec btn-sm cron-icon-btn"
                          aria-label="Sunting"
                          title="Sunting cronjob"
                          disabled={!!busy}
                          onClick={() => void edit(c)}
                        >
                          <UpcomingIcon name="edit" />
                        </button>
                        <button
                          className="btn btn-sec btn-sm cron-icon-btn cron-delete"
                          aria-label="Hapus"
                          title="Hapus cronjob"
                          disabled={!!busy}
                          onClick={() => void remove(c)}
                        >
                          {busy === `${c.contentTypeId}:${c.id}` ? (
                            <span className="spinner" />
                          ) : (
                            <UpcomingIcon name="delete" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!paged.total && (
                  <tr>
                    <td colSpan={6} className="cron-empty">
                      {search
                        ? "Tidak ada jadwal yang sesuai pencarian."
                        : "Belum ada cronjob. Tambahkan jadwal melalui tombol Tambah Cronjob."}
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
      {selected && (
        <ContentTypeContext.Provider value={selected}>
          <CronTable<string>
            key={selected.id}
            createOnly
            initialCron={editing?.cron}
            items={[]}
            stages={cronStages(selected)}
            typeOptions={editing ? undefined : types}
            onTypeChange={(id) =>
              setSelected(types.find((type) => type.id === id) || null)
            }
            onClose={() => setSelected(null)}
            onDelete={async () => {}}
            onSave={async (cron) => {
              await api(
                selected.engine === "news" ? "/news-crons" : "/book-crons",
                "PUT",
                cron,
                selected.id,
              );
              setRefresh((v) => v + 1);
            }}
          />
        </ContentTypeContext.Provider>
      )}
    </section>
  );
}

function UpcomingIcon({
  name,
}: {
  name: "search" | "refresh" | "left" | "right" | "edit" | "delete";
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
      {name === "edit" ? (
        <>
          <path d="m16 3 5 5-12 12-6 1 1-6Z" />
          <path d="m14 5 5 5" />
        </>
      ) : name === "delete" ? (
        <>
          <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
        </>
      ) : name === "search" ? (
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
