// Pengaturan Konten › Publikasi: aturan konten per sosmed yang diikuti Admin Sosmed.
import React from "react";
import {
  INSTAGRAM_FORMATS,
  socialTargets,
  type BookSettings,
  type InstagramFormat,
  type SocialTarget,
} from "../server/book-settings";
import {
  DEFAULT_TIKTOK_SETTINGS,
  normalizeTikTokSettings,
} from "../server/tiktok-settings";
import type { InstagramConnection } from "../server/instagram-account";
import {
  INSTAGRAM_FORMAT_LABEL,
  NEEDS_OUTPUT,
  OUTPUT_LABEL,
  TIKTOK_MEDIA_LABEL,
  YOUTUBE_MEDIA_LABEL,
  instagramFormats,
  socialPlan,
  youtubeMediaFor,
} from "../server/social-plan";

type Account = { id: string; username: string; platform: string };
type Patch = Partial<BookSettings>;
export function SocialPlanFields({
  settings,
  outputs,
  engine = "book",
  instagram,
  zernioAccounts,
  zernioState,
  onChange,
}: {
  settings: BookSettings;
  outputs: string[];
  engine?: string;
  instagram?: InstagramConnection;
  zernioAccounts: Account[];
  zernioState: string;
  onChange: (patch: Patch) => void;
}) {
  const plan = socialPlan(outputs, settings, engine);
  const active = socialTargets(settings);
  const toggle = (platform: SocialTarget, on: boolean) =>
    onChange({
      socialTargets: on
        ? [...active, platform]
        : active.filter((p) => p !== platform),
    });
  const accountsFor = (platform: SocialTarget) =>
    platform === "instagram"
      ? (instagram?.accounts ?? [])
      : zernioAccounts.filter((a) => a.platform === platform);
  const stateFor = (platform: SocialTarget) =>
    platform === "instagram" ? (instagram?.state ?? "loading") : zernioState;
  const has = (kind: string) => outputs.includes(kind);
  const needNote = (kind: string) =>
    has(kind) ? "" : ` · butuh output ${OUTPUT_LABEL[kind]}`;
  const tiktok = normalizeTikTokSettings(settings.tiktok);

  return (
    <fieldset className="social-plan">
      <legend>Rencana konten sosmed</legend>
      <p className="muted">
        Untuk tiap sosmed: aktifkan, pilih akun, lalu tentukan konten yang
        diposting. Admin Sosmed dan Manajer di Kantor mengikuti aturan ini.
      </p>
      {plan.map((row) => {
        const key = `${row.platform}AccountId` as const;
        const accounts = accountsFor(row.platform);
        return (
          <section
            key={row.platform}
            className={"social-plan-row" + (row.active ? " on" : "")}
          >
            <div className="social-plan-head">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={row.active}
                  onChange={(e) => toggle(row.platform, e.target.checked)}
                />
                <b>{row.label}</b>
              </label>
              {!row.active && <small className="muted">Nonaktif</small>}
            </div>
            {row.active && (
              <div className="social-plan-body">
                <label className="field">
                  Akun tujuan
                  <select
                    aria-label={`Akun tujuan ${row.label}`}
                    value={settings[key] || ""}
                    disabled={stateFor(row.platform) === "loading"}
                    onChange={(e) =>
                      onChange({ [key]: e.target.value || null })
                    }
                  >
                    <option value="">
                      {row.platform === "instagram"
                        ? "Akun utama NC-WA"
                        : "Pilih akun tujuan"}
                    </option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        @{a.username}
                      </option>
                    ))}
                    {settings[key] &&
                      !accounts.some((a) => a.id === settings[key]) && (
                        <option value={settings[key]!}>
                          Akun tersimpan tidak tersedia
                        </option>
                      )}
                  </select>
                </label>
                <div className="field">
                  <span>Konten yang diposting</span>
                  {row.platform === "instagram" && (
                    <div className="social-plan-choices">
                      {INSTAGRAM_FORMATS.map((format: InstagramFormat) => (
                        <label className="check-row" key={format}>
                          <input
                            type="checkbox"
                            checked={instagramFormats(settings).includes(
                              format,
                            )}
                            onChange={(e) =>
                              onChange({
                                instagramFormats: e.target.checked
                                  ? [...instagramFormats(settings), format]
                                  : instagramFormats(settings).filter(
                                      (f) => f !== format,
                                    ),
                              })
                            }
                          />
                          {INSTAGRAM_FORMAT_LABEL[format]}
                          <small className="muted">
                            {needNote(NEEDS_OUTPUT[format])}
                          </small>
                        </label>
                      ))}
                    </div>
                  )}
                  {row.platform === "tiktok" && (
                    <div
                      className="social-plan-choices"
                      role="radiogroup"
                      aria-label="Media TikTok"
                    >
                      {(["v", "h", "photo"] as const).map((media) => (
                        <label className="check-row" key={media}>
                          <input
                            type="radio"
                            name="plan-tiktok-media"
                            checked={tiktok.media === media}
                            onChange={() =>
                              onChange({
                                tiktok: {
                                  ...DEFAULT_TIKTOK_SETTINGS,
                                  ...settings.tiktok,
                                  media,
                                },
                              })
                            }
                          />
                          {TIKTOK_MEDIA_LABEL[media]}
                          <small className="muted">
                            {needNote(NEEDS_OUTPUT[media])}
                          </small>
                        </label>
                      ))}
                    </div>
                  )}
                  {row.platform === "youtube" && (
                    <div
                      className="social-plan-choices"
                      role="radiogroup"
                      aria-label="Media YouTube"
                    >
                      {(["v", "h"] as const).map((media) => (
                        <label className="check-row" key={media}>
                          <input
                            type="radio"
                            name="plan-youtube-media"
                            disabled={!has(NEEDS_OUTPUT[media])}
                            checked={youtubeMediaFor(settings) === media}
                            onChange={() => onChange({ youtubeMedia: media })}
                          />
                          {YOUTUBE_MEDIA_LABEL[media]}
                          <small className="muted">
                            {needNote(NEEDS_OUTPUT[media])}
                          </small>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <p
                  className={
                    "social-plan-summary" + (row.problems.length ? " warn" : "")
                  }
                >
                  {row.posts.length
                    ? `Diposting: ${row.posts.join(" + ")}`
                    : "Belum ada konten yang bisa diposting"}
                  {row.problems.length > 0 && ` — ${row.problems.join("; ")}`}
                </p>
              </div>
            )}
          </section>
        );
      })}
    </fieldset>
  );
}
