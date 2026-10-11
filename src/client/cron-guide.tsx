import React, { useEffect, useState } from "react";
import { api } from "./api";
import {
  GUIDE_STAGES,
  normalizeCronGuide,
  windowMinutes,
  type CronGuide,
  type TimeWindow,
} from "../server/cron-guide-domain";

const postingLabels = { morning: "Pagi", noon: "Siang", evening: "Sore" };
export function CronGuidePanel() {
  const [guide, setGuide] = useState<CronGuide | null>(null);
  const [saved, setSaved] = useState<CronGuide | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api("/cron-guide", "GET", undefined, null);
      setGuide(data);
      setSaved(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const dirty = JSON.stringify(guide) !== JSON.stringify(saved);
  function change(next: CronGuide) {
    setGuide(next);
    setMessage("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!guide) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const data = await api(
        "/cron-guide",
        "PUT",
        normalizeCronGuide(guide),
        null,
      );
      setGuide(data);
      setSaved(data);
      setMessage("Guide disimpan.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function windowFields(
    label: string,
    value: TimeWindow,
    onChange: (next: TimeWindow) => void,
  ) {
    return (
      <div className="guide-time-range">
        <input
          aria-label={`${label} mulai`}
          type="time"
          required
          value={value.start}
          onChange={(e) => onChange({ ...value, start: e.target.value })}
        />
        <span aria-hidden="true">–</span>
        <input
          aria-label={`${label} selesai`}
          type="time"
          required
          value={value.end}
          onChange={(e) => onChange({ ...value, end: e.target.value })}
        />
      </div>
    );
  }
  let capacity = 0,
    cycle = 0;
  if (guide) {
    try {
      capacity = windowMinutes(guide.production);
    } catch {}
    cycle =
      guide.durations.article +
      guide.durations.audio +
      guide.durations.images +
      guide.durations.video +
      guide.gapMinutes * 3;
  }
  return (
    <div className="cron-guide-panel">
      <div className="guide-heading">
        <div>
          <h2 className="h3">Guide waktu cronjob</h2>
          <p className="muted">
            Acuan global durasi dan jam ideal untuk auto buat serta optimasi
            cronjob.
          </p>
        </div>
        <span className="cron-chart-zone">WIB</span>
      </div>
      {error && (
        <p role="alert" className="warn">
          {error}
        </p>
      )}
      {loading ? (
        <p className="lab-run-status">
          <span className="spinner" />
          Memuat Guide…
        </p>
      ) : !guide ? (
        <button className="btn btn-sec" onClick={() => void load()}>
          Coba lagi
        </button>
      ) : (
        <form onSubmit={(e) => void save(e)}>
          <fieldset disabled={saving} className="guide-fieldset">
            <div className="guide-grid">
              <section className="guide-section">
                <h3 className="h3">Perkiraan durasi</h3>
                <div className="table">
                  <table className="guide-table">
                    <thead>
                      <tr>
                        <th>Proses</th>
                        <th>Durasi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {GUIDE_STAGES.map(([stage, label]) => (
                        <tr key={stage}>
                          <td>{label}</td>
                          <td>
                            <div className="guide-duration">
                              <input
                                type="number"
                                aria-label={`Durasi ${label}`}
                                min="1"
                                max="1440"
                                required
                                value={
                                  Number.isNaN(guide.durations[stage])
                                    ? ""
                                    : guide.durations[stage]
                                }
                                onChange={(e) =>
                                  change({
                                    ...guide,
                                    durations: {
                                      ...guide.durations,
                                      [stage]:
                                        e.target.value === ""
                                          ? NaN
                                          : Number(e.target.value),
                                    },
                                  })
                                }
                              />
                              <span>menit</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="guide-section">
                <h3 className="h3">Jam ideal</h3>
                <div className="table">
                  <table className="guide-table">
                    <thead>
                      <tr>
                        <th>Aktivitas</th>
                        <th>Rentang waktu</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          Pembuatan konten
                          <span className="guide-note">
                            Artikel, audio, gambar, video
                          </span>
                        </td>
                        <td>
                          {windowFields(
                            "Produksi",
                            guide.production,
                            (production) => change({ ...guide, production }),
                          )}
                          <span className="guide-note">
                            {guide.production.end < guide.production.start
                              ? "Selesai hari berikutnya"
                              : "Dalam hari yang sama"}
                          </span>
                        </td>
                      </tr>
                      {(
                        Object.keys(
                          postingLabels,
                        ) as (keyof typeof postingLabels)[]
                      ).map((key) => (
                        <tr key={key}>
                          <td>Posting {postingLabels[key].toLowerCase()}</td>
                          <td>
                            {windowFields(
                              `Posting ${postingLabels[key].toLowerCase()}`,
                              guide.posting[key],
                              (value) =>
                                change({
                                  ...guide,
                                  posting: { ...guide.posting, [key]: value },
                                }),
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            <section className="guide-policy">
              <div>
                <h3 className="h3">Jarak antarproses</h3>
                <p className="muted">
                  Slot berikutnya dimulai setelah durasi proses sebelumnya
                  ditambah jeda. Perhitungan berlaku lintas semua jenis konten.
                </p>
              </div>
              <label>
                Jeda tambahan
                <div className="guide-duration">
                  <input
                    aria-label="Jeda tambahan"
                    type="number"
                    min="0"
                    max="1439"
                    required
                    value={
                      Number.isNaN(guide.gapMinutes) ? "" : guide.gapMinutes
                    }
                    onChange={(e) =>
                      change({
                        ...guide,
                        gapMinutes:
                          e.target.value === "" ? NaN : Number(e.target.value),
                      })
                    }
                  />
                  <span>menit</span>
                </div>
              </label>
            </section>
            <p className="muted guide-estimate">
              Rentang produksi: {capacity} menit · Artikel → audio → gambar →
              video: {Number.isFinite(cycle) ? cycle : "—"} menit
              {cycle > capacity && capacity > 0
                ? " · Rangkaian ini melebihi rentang produksi."
                : ""}
            </p>
            <div className="guide-savebar">
              <span role="status">
                {message ||
                  (dirty ? "Ada perubahan belum disimpan" : "Guide tersimpan")}
              </span>
              <div>
                <button
                  className="btn btn-sec"
                  type="button"
                  disabled={!dirty}
                  onClick={() => {
                    setGuide(saved);
                    setMessage("");
                    setError("");
                  }}
                >
                  Batal
                </button>
                <button className="btn btn-pri" type="submit" disabled={!dirty}>
                  {saving && <span className="spinner" />}{" "}
                  {saving ? "Menyimpan…" : "Simpan Guide"}
                </button>
              </div>
            </div>
          </fieldset>
        </form>
      )}
    </div>
  );
}
