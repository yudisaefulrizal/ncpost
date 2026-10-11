import React, { useState } from "react";
import { Modal } from "./modal";
import type { BookCron } from "../server/cron";
import {
  CRON_DAYS,
  normalizeSchedule,
  scheduleLabel,
  type CronSchedule,
} from "../server/cron-schedule";
import { useContentType } from "./content-types";

export function CronTable<K extends string>({
  items,
  stages,
  onSave,
  onDelete,
}: {
  items: BookCron<K>[];
  stages: readonly (readonly [K, string])[];
  onSave: (cron: BookCron<K>) => Promise<void>;
  onDelete: (cron: BookCron<K>) => Promise<void>;
}) {
  const type = useContentType();
  const [draft, setDraft] = useState<BookCron<K> | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [toggling, setToggling] = useState<{
    id?: string;
    enabled: boolean;
  } | null>(null);
  const act = async (action: () => Promise<void>, close = false) => {
    setBusy(true);
    setError("");
    try {
      await action();
      if (close) setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const edit = (cron?: BookCron<K>) => {
    setError("");
    setDraft(
      cron
        ? {
            ...cron,
            schedule: cron.schedule || {
              mode: "daily",
              times: [
                cron.next_run
                  ? new Date(cron.next_run).toLocaleTimeString("en-GB", {
                      timeZone: "Asia/Jakarta",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "09:00",
              ],
              days: [],
            },
          }
        : {
            book: type?.name || "",
            kind: stages[0][0],
            enabled: false,
            intervalHours: 24,
            batchSize: 1,
            schedule: { mode: "daily", times: ["09:00"], days: [] },
            next_run: null,
            last_tick: null,
            last_result: null,
          },
    );
  };
  const schedule = draft?.schedule;
  const changeSchedule = (value: Partial<CronSchedule>) => {
    if (draft && schedule)
      setDraft({ ...draft, schedule: { ...schedule, ...value } });
  };
  return (
    <div className="stack cron-settings">
      <div className="card-title cron-header">
        <div className="cron-heading">
          <h2 className="h3">{type?.name || "Cronjob"}</h2>
          <span className="cron-count">{items.length} jadwal</span>
        </div>
        <button
          className="btn btn-pri"
          disabled={busy || !stages.length}
          onClick={() => edit()}
        >
          <CronIcon name="plus" /> Tambah Cronjob
        </button>
      </div>
      {error && !draft && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      {busy && !draft && (
        <p className="lab-run-status" role="status">
          <span className="spinner" aria-hidden="true" />
          Menyimpan perubahan…
        </p>
      )}
      <div className="table">
        <table className="cron-table">
          <thead>
            <tr>
              <th>Konten</th>
              <th>Proses</th>
              <th>Jadwal</th>
              <th>Status</th>
              <th>Berikutnya</th>
              <th>Hasil terakhir</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {items.map((cron) => (
              <tr key={cron.id || cron.kind}>
                <td className="cron-content">{type?.name || cron.book}</td>
                <td>
                  {stages.find(([kind]) => kind === cron.kind)?.[1] ||
                    cron.kind}
                </td>
                <td>
                  <div className="cron-schedule-cell">
                    <span className="cron-frequency">
                      {cron.schedule?.mode === "weekly"
                        ? "Mingguan"
                        : cron.schedule
                          ? "Harian"
                          : "Interval lama"}
                    </span>
                    {cron.schedule ? (
                      <>
                        {cron.schedule.mode === "weekly" && (
                          <span className="cron-weekdays">
                            {cron.schedule.days
                              .map((day) => CRON_DAYS[day])
                              .join(", ")}
                          </span>
                        )}
                        <div className="cron-hours">
                          {cron.schedule.times.map((time) => (
                            <span key={time}>{time}</span>
                          ))}
                          <small>WIB</small>
                        </div>
                      </>
                    ) : (
                      <span className="muted">
                        {scheduleLabel(null, cron.intervalHours)}
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  <label className="cron-status-control">
                    <input
                      className="cron-switch"
                      role="switch"
                      type="checkbox"
                      aria-label={`Aktifkan ${cron.kind}`}
                      checked={
                        toggling?.id === cron.id
                          ? (toggling?.enabled ?? cron.enabled)
                          : cron.enabled
                      }
                      disabled={busy}
                      title="Aktifkan cronjob"
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setToggling({ id: cron.id, enabled });
                        void act(async () => {
                          try {
                            await onSave({ ...cron, enabled });
                          } finally {
                            setToggling(null);
                          }
                        });
                      }}
                    />
                    <span>
                      {(
                        toggling?.id === cron.id
                          ? (toggling?.enabled ?? cron.enabled)
                          : cron.enabled
                      )
                        ? "Aktif"
                        : "Nonaktif"}
                    </span>
                  </label>
                </td>
                <td>
                  {cron.enabled && cron.next_run ? (
                    <div className="cron-next">
                      <strong>
                        {new Date(cron.next_run).toLocaleTimeString("id-ID", {
                          timeZone: "Asia/Jakarta",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        <small>WIB</small>
                      </strong>
                      <span>
                        {new Date(cron.next_run).toLocaleDateString("id-ID", {
                          timeZone: "Asia/Jakarta",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="cron-result">
                  <span
                    className={
                      cron.last_result?.startsWith("Gagal") ? "warn" : "muted"
                    }
                  >
                    {cron.last_result || "Belum dijalankan"}
                  </span>
                </td>
                <td>
                  <div className="cron-actions">
                    <button
                      className="btn btn-sec btn-sm cron-icon-btn"
                      aria-label="Sunting"
                      title="Sunting cronjob"
                      disabled={busy}
                      onClick={() => edit(cron)}
                    >
                      <CronIcon name="edit" />
                    </button>
                    <button
                      className="btn btn-sec btn-sm cron-icon-btn cron-delete"
                      aria-label="Hapus"
                      title="Hapus cronjob"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm("Hapus cronjob ini?"))
                          void act(() => onDelete(cron));
                      }}
                    >
                      <CronIcon name="delete" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={7} className="cron-empty">
                  Belum ada cronjob. Tambahkan jadwal untuk aksi yang ingin
                  dijalankan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {draft && schedule && (
        <Modal
          title={draft.id ? "Sunting Cronjob" : "Tambah Cronjob"}
          onClose={() => {
            if (!busy) setDraft(null);
          }}
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                const normalized = normalizeSchedule(schedule);
                await onSave({ ...draft, schedule: normalized });
              }, true);
            }}
          >
            <fieldset className="cron-form stack" disabled={busy}>
              <label className="field">
                Jenis konten
                <input value={type?.name || draft.book} readOnly />
              </label>
              <label className="field">
                Aksi
                <select
                  aria-label="Aksi"
                  value={draft.kind}
                  onChange={(e) =>
                    setDraft({ ...draft, kind: e.target.value as K })
                  }
                >
                  {!stages.some(([kind]) => kind === draft.kind) && (
                    <option value={draft.kind}>
                      {draft.kind} (tidak aktif pada jenis ini)
                    </option>
                  )}
                  {stages.map(([kind, label]) => (
                    <option key={kind} value={kind}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Jadwal
                <select
                  aria-label="Jadwal"
                  value={schedule.mode}
                  onChange={(e) =>
                    changeSchedule({
                      mode: e.target.value as CronSchedule["mode"],
                      days:
                        e.target.value === "weekly"
                          ? schedule.days.length
                            ? schedule.days
                            : [1]
                          : [],
                    })
                  }
                >
                  <option value="daily">Harian</option>
                  <option value="weekly">Mingguan</option>
                </select>
              </label>
              {schedule.mode === "weekly" && (
                <div className="field">
                  Hari
                  <div className="cron-days">
                    {CRON_DAYS.map((day, index) => (
                      <label className="check-row" key={day}>
                        <input
                          type="checkbox"
                          checked={schedule.days.includes(index)}
                          onChange={(e) =>
                            changeSchedule({
                              days: e.target.checked
                                ? [...schedule.days, index]
                                : schedule.days.filter((d) => d !== index),
                            })
                          }
                        />
                        {day}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="field">
                Jam (WIB)
                <div className="stack-sm">
                  {schedule.times.map((time, index) => (
                    <div className="cron-time" key={index}>
                      <input
                        type="time"
                        required
                        aria-label={`Jam ${index + 1}`}
                        value={time}
                        onChange={(e) =>
                          changeSchedule({
                            times: schedule.times.map((t, i) =>
                              i === index ? e.target.value : t,
                            ),
                          })
                        }
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={schedule.times.length === 1}
                        aria-label={`Hapus jam ${index + 1}`}
                        onClick={() =>
                          changeSchedule({
                            times: schedule.times.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <CronIcon name="delete" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn-sec btn-sm"
                  disabled={schedule.times.length >= 48}
                  onClick={() =>
                    changeSchedule({ times: [...schedule.times, ""] })
                  }
                >
                  Tambah jam
                </button>
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) =>
                    setDraft({ ...draft, enabled: e.target.checked })
                  }
                />
                Aktif
              </label>
            </fieldset>
            {error && (
              <p className="warn" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-pri" disabled={busy} type="submit">
              {busy ? "Menyimpan…" : "Simpan Cronjob"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function CronIcon({ name }: { name: "plus" | "edit" | "delete" }) {
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
      {name === "plus" ? (
        <path d="M12 5v14M5 12h14" />
      ) : name === "edit" ? (
        <>
          <path d="m15 5 4 4M4 20l4-1 12-12a2.8 2.8 0 0 0-4-4L4 15v5Z" />
        </>
      ) : (
        <>
          <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
        </>
      )}
    </svg>
  );
}
