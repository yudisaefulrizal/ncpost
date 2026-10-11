import React, { useEffect, useState } from "react";
import { api } from "./api";
import { paginateRows } from "./pagination";
import type { UpcomingCron } from "../server/cron-upcoming";
import { CronChart } from "./cron-chart";
import { CronGuidePanel } from "./cron-guide";
import { ProcessTimingPanel } from "./process-timing";
import { CronTable } from "./cron-settings";
import { ContentTypeContext } from "./content-types";
import { contentAllows, type ContentType } from "../server/content-type-domain";
import { CRON_TYPES } from "../server/cron";
import { NEWS_CRON_TYPES } from "../server/news-production-domain";
import { duplicateCron } from "./cron-form";
import { scheduleLabel } from "../server/cron-schedule";
const cronStages = (type: ContentType) =>
  (type.engine === "news" ? NEWS_CRON_TYPES : CRON_TYPES).filter(([kind]) =>
    contentAllows(type, kind),
  );
export function UpcomingCronsPage() {
  const [tab, setTab] = useState<
    "list" | "chart" | "guide" | "history" | "eta"
  >("list");
  const [types, setTypes] = useState<ContentType[]>([]);
  const [selected, setSelected] = useState<ContentType | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<UpcomingCron | null>(null);
  const [busy, setBusy] = useState("");
  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftMinutes, setShiftMinutes] = useState("15");
  const [shiftDirection, setShiftDirection] = useState("later");
  const [shiftMessage, setShiftMessage] = useState("");
  async function shiftAll() {
    const amount = Number(shiftMinutes);
    if (!Number.isInteger(amount) || amount < 1 || amount > 1439) {
      setError("Isi pergeseran 1–1439 menit");
      return;
    }
    setBusy("shift-all");
    setError("");
    setShiftMessage("");
    try {
      const result = await api(
        "/crons/shift",
        "POST",
        {
          minutes: shiftDirection === "earlier" ? -amount : amount,
        },
        null,
      );
      setShiftMessage(
        `${result.updated} jadwal digeser.${result.skipped ? ` ${result.skipped} jadwal lama berbasis interval dilewati.` : ""}`,
      );
      setShiftOpen(false);
      setRefresh((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function edit(item: UpcomingCron, copy = false) {
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
      setTypes(available.filter((t) => cronStages(t).length));
      setEditing(
        copy && item.cron ? { ...item, cron: duplicateCron(item.cron) } : item,
      );
      setSelected(type);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function remove(item: UpcomingCron) {
    if (
      !window.confirm(`Hapus jadwal ${item.label} untuk ${item.contentType}?`)
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
      <div
        className="cron-page-tabs"
        role="tablist"
        aria-label="Tampilan jadwal"
      >
        <button
          role="tab"
          id="cron-list-tab"
          aria-selected={tab === "list"}
          aria-controls="cron-list-panel"
          onClick={() => setTab("list")}
        >
          List Jadwal
        </button>
        <button
          role="tab"
          id="cron-chart-tab"
          aria-selected={tab === "chart"}
          aria-controls="cron-chart-panel"
          onClick={() => setTab("chart")}
        >
          Grafik
        </button>
        <button
          role="tab"
          id="cron-guide-tab"
          aria-selected={tab === "guide"}
          aria-controls="cron-guide-panel"
          onClick={() => setTab("guide")}
        >
          Guide
        </button>
        <button
          role="tab"
          id="cron-history-tab"
          aria-selected={tab === "history"}
          aria-controls="cron-history-panel"
          onClick={() => setTab("history")}
        >
          Histori
        </button>
        <button
          role="tab"
          id="cron-eta-tab"
          aria-selected={tab === "eta"}
          aria-controls="cron-eta-panel"
          onClick={() => setTab("eta")}
        >
          ETA
        </button>
      </div>
      {tab === "list" && (
        <div
          id="cron-list-panel"
          role="tabpanel"
          aria-labelledby="cron-list-tab"
        >
          <div className="upcoming-toolbar">
            <div className="cron-heading">
              <h2 className="h3">Semua jadwal</h2>
              <span className="cron-count">{items.length}</span>
            </div>
            <div className="upcoming-controls">
              <div className="upcoming-search">
                <UpcomingIcon name="search" />
                <input
                  aria-label="Cari jadwal"
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
                {adding && <span className="spinner" aria-hidden="true" />}{" "}
                Tambah Jadwal
              </button>
              <button
                className="btn btn-sec"
                disabled={loading || !!busy || !items.length}
                onClick={() => setShiftOpen((v) => !v)}
              >
                Geser semua waktu
              </button>
            </div>
          </div>
          {shiftOpen && (
            <form
              className="cron-bulk-shift"
              onSubmit={(e) => {
                e.preventDefault();
                void shiftAll();
              }}
            >
              <div className="cron-heading">
                <h3 className="h3">Geser semua waktu jadwal</h3>
              </div>
              <div className="cron-bulk-shift-controls">
                <label>
                  Arah
                  <select
                    aria-label="Arah"
                    value={shiftDirection}
                    disabled={!!busy}
                    onChange={(e) => setShiftDirection(e.target.value)}
                  >
                    <option value="later">Lebih lambat (+)</option>
                    <option value="earlier">Lebih awal (−)</option>
                  </select>
                </label>
                <label>
                  Menit
                  <input
                    type="number"
                    min="1"
                    max="1439"
                    required
                    value={shiftMinutes}
                    disabled={!!busy}
                    onChange={(e) => setShiftMinutes(e.target.value)}
                  />
                </label>
                <button className="btn btn-pri" disabled={!!busy} type="submit">
                  {busy === "shift-all" && (
                    <span className="spinner" aria-hidden="true" />
                  )}{" "}
                  Terapkan ke semua jadwal
                </button>
                <button
                  className="btn btn-sec"
                  type="button"
                  disabled={!!busy}
                  onClick={() => setShiftOpen(false)}
                >
                  Batal
                </button>
              </div>
              <p className="muted">
                Berlaku untuk jadwal harian dan mingguan, aktif maupun nonaktif,
                di semua jenis konten. Hari tetap sama; jam melewati 00:00
                berputar dalam 24 jam. Jadwal lama berbasis interval dilewati.
              </p>
            </form>
          )}
          {shiftMessage && (
            <p role="status" className="cron-shift-result">
              {shiftMessage}
            </p>
          )}
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
                                {new Date(c.nextRun).toLocaleTimeString(
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
                                {new Date(c.nextRun).toLocaleDateString(
                                  "id-ID",
                                  {
                                    timeZone: "Asia/Jakarta",
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                  },
                                )}
                              </span>
                              {c.nextRun <= Date.now() && (
                                <span className="upcoming-waiting">
                                  Menunggu
                                </span>
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
                              title="Sunting jadwal"
                              disabled={!!busy}
                              onClick={() => void edit(c)}
                            >
                              <UpcomingIcon name="edit" />
                            </button>
                            <button
                              className="btn btn-sec btn-sm cron-icon-btn"
                              aria-label="Duplikasi"
                              title="Duplikasi jadwal"
                              disabled={!!busy}
                              onClick={() => void edit(c, true)}
                            >
                              <UpcomingIcon name="copy" />
                            </button>
                            <button
                              className="btn btn-sec btn-sm cron-icon-btn cron-delete"
                              aria-label="Hapus"
                              title="Hapus jadwal"
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
                            : "Belum ada jadwal. Tambahkan jadwal melalui tombol Tambah Jadwal."}
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
        </div>
      )}
      {tab === "chart" && (
        <div
          id="cron-chart-panel"
          role="tabpanel"
          aria-labelledby="cron-chart-tab"
        >
          {error && (
            <p className="warn" role="alert">
              {error}
            </p>
          )}
          <CronChart
            items={items}
            loading={loading}
            onRefresh={() => setRefresh((v) => v + 1)}
          />
        </div>
      )}
      {tab === "guide" && (
        <div
          id="cron-guide-panel"
          role="tabpanel"
          aria-labelledby="cron-guide-tab"
        >
          <CronGuidePanel />
        </div>
      )}
      {(tab === "history" || tab === "eta") && (
        <div
          role="tabpanel"
          id={`cron-${tab}-panel`}
          aria-labelledby={`cron-${tab}-tab`}
        >
          <ProcessTimingPanel key={tab} mode={tab} />
        </div>
      )}
      {selected && (
        <ContentTypeContext.Provider value={selected}>
          <CronTable<string>
            createOnly
            initialCron={editing?.cron}
            items={[]}
            stages={cronStages(selected)}
            typeOptions={editing?.cron?.id ? undefined : types}
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
  name: "search" | "refresh" | "left" | "right" | "edit" | "delete" | "copy";
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
      {name === "copy" ? (
        <>
          <rect x="8" y="8" width="13" height="13" rx="2" />
          <path d="M16 8V3H3v13h5" />
        </>
      ) : name === "edit" ? (
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
