import React, { useEffect, useState } from "react";
import {
  DEFAULT_TIKTOK_SETTINGS,
  type TikTokSettings,
} from "../server/tiktok-settings";
export function TikTokSettingsFields({
  accountId,
  value,
  onChange,
}: {
  accountId: string | null;
  value?: TikTokSettings;
  onChange: (value: TikTokSettings) => void;
}) {
  const settings = value || DEFAULT_TIKTOK_SETTINGS;
  const [creator, setCreator] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setCreator(null);
    setError("");
    if (accountId)
      fetch(
        `/api/zernio/creator/${accountId}?mediaType=${settings.media === "photo" ? "photo" : "video"}`,
      )
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok)
            throw Error(data.error || "Gagal memuat pengaturan TikTok");
          return data;
        })
        .then((data) => {
          if (current) setCreator(data);
        })
        .catch((error) => {
          if (current) setError(error.message);
        });
    return () => {
      current = false;
    };
  }, [accountId, settings.media]);
  const set = (patch: Partial<TikTokSettings>) =>
    onChange({ ...settings, ...patch });
  return (
    <fieldset className="stack">
      <legend>Pengaturan publish TikTok</legend>
      <div className="settings-grid">
        <label className="field">
          Media TikTok
          <select
            aria-label="Media TikTok"
            value={settings.media}
            onChange={(e) =>
              set({ media: e.target.value as TikTokSettings["media"] })
            }
          >
            <option value="v">Video vertikal</option>
            <option value="h">Video horizontal</option>
            <option value="photo">Carousel</option>
          </select>
        </label>
        <label className="field">
          Privasi TikTok
          <select
            aria-label="Privasi TikTok"
            value={settings.privacy}
            disabled={!creator}
            onChange={(e) => set({ privacy: e.target.value })}
          >
            <option value="">Pilih privasi</option>
            {creator?.privacyLevels.map((level: any) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
            {settings.privacy &&
              !creator?.privacyLevels.some(
                (level: any) => level.value === settings.privacy,
              ) && <option value={settings.privacy}>{settings.privacy}</option>}
          </select>
        </label>
      </div>
      {(
        [
          ["allowComment", "Izinkan komentar", "allow_comment"],
          ["allowDuet", "Izinkan duet", "allow_duet"],
          ["allowStitch", "Izinkan stitch", "allow_stitch"],
        ] as const
      )
        .filter(([key]) => settings.media !== "photo" || key === "allowComment")
        .map(([key, label, capability]) => (
          <label className="check-row" key={key}>
            <input
              type="checkbox"
              checked={settings[key]}
              disabled={!creator?.interactions[capability]}
              onChange={(e) => set({ [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      <label className="check-row">
        <input
          type="checkbox"
          checked={settings.synthetic}
          onChange={(e) => set({ synthetic: e.target.checked })}
        />
        Konten mengandung materi sintetis / AI
      </label>
      {settings.media === "photo" && (
        <label className="check-row">
          <input
            type="checkbox"
            checked={settings.autoMusic}
            onChange={(e) => set({ autoMusic: e.target.checked })}
          />
          Tambahkan musik otomatis
        </label>
      )}
      {error && (
        <p role="alert" className="warn">
          {error}
        </p>
      )}
    </fieldset>
  );
}
