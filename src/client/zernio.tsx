import { TikTokSettingsFields } from "./tiktok-settings";
import type { TikTokSettings } from "../server/tiktok-settings";
import { socialTargets, type SocialTarget } from "../server/book-settings";
import type { InstagramConnection } from "../server/instagram-account";
import React, { useEffect, useState } from "react";
async function api(route: string, body?: unknown) {
  const response = await fetch(`/api/zernio${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Operasi Zernio gagal");
  return data;
}
type Account = { id: string; username: string; platform: "youtube" | "tiktok" };
type Video = {
  key: string;
  title: string;
  previews: string[];
  mediaType: "video" | "photo";
};
export function ZernioPanel({
  settings,
  instagram,
  credentials = false,
  onChange,
  publication,
  onPublished,
}: {
  instagram?: InstagramConnection;
  credentials?: boolean;
  settings?: {
    tiktok?: TikTokSettings;
    socialTargets?: SocialTarget[];
    instagramAccountId: string | null;
    youtubeAccountId: string | null;
    tiktokAccountId: string | null;
  };
  onChange?: (value: {
    tiktok?: TikTokSettings;
    socialTargets?: SocialTarget[];
    instagramAccountId?: string | null;
    youtubeAccountId?: string | null;
    tiktokAccountId?: string | null;
  }) => void;
  publication?: {
    source: string;
    platform: "youtube" | "tiktok";
    accountId: string | null;
  };
  onPublished?: () => void;
}) {
  const [connection, setConnection] = useState<{
    state: string;
    reason?: string;
    accounts: Account[];
  }>({ state: "loading", accounts: [] });
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const [profile, setProfile] = useState("");
  const [profileName, setProfileName] = useState("");
  const [videos, setVideos] = useState<Video[]>([]);
  const [videoKey, setVideoKey] = useState("");
  const [mediaType, setMediaType] = useState<"video" | "photo">("video");
  const [autoMusic, setAutoMusic] = useState(false);
  const [accountId, setAccountId] = useState(publication?.accountId || "");
  const [posts, setPosts] = useState<any[]>([]);
  const [creator, setCreator] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState("");
  const [privacy, setPrivacy] = useState("");
  const [madeForKids, setMadeForKids] = useState(false);
  const [synthetic, setSynthetic] = useState(false);
  const [consent, setConsent] = useState(false);
  const [interactions, setInteractions] = useState<Record<string, boolean>>({});
  const account = connection.accounts.find((a) => a.id === accountId);
  const video = videos.find((v) => v.key === videoKey);
  async function load() {
    const c = await api("/accounts");
    setConnection(c);
    if (credentials) {
      if (c.state === "connected") {
        const p = await api("/profiles");
        setProfiles(p.profiles);
        setProfile(p.selectedProfileId || "");
      }
      return;
    }
    if (settings) return;
    if (c.state === "connected") {
      const [v, history] = await Promise.all([api("/media"), api("/posts")]);
      setVideos(
        v.filter(
          (item: Video) =>
            !publication ||
            (item.key.startsWith(publication.source + ":") &&
              (publication.platform !== "youtube" ||
                item.mediaType === "video")),
        ),
      );
      setPosts(
        history.filter(
          (item: any) =>
            !publication ||
            (item.source_key.startsWith(publication.source + ":") &&
              item.platform === publication.platform),
        ),
      );
    }
  }
  async function action(run: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await run();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void action(load);
  }, []);
  useEffect(() => {
    setPrivacy("");
    setConsent(false);
    setInteractions({});
    setCreator(null);
    if (account?.platform !== "tiktok") return;
    let current = true;
    api(`/creator/${account.id}?mediaType=${mediaType}`)
      .then((data) => {
        if (current) setCreator(data);
      })
      .catch((error) => {
        if (current) setMessage(error.message);
      });
    return () => {
      current = false;
    };
  }, [accountId, account?.platform, mediaType]);
  useEffect(() => {
    setConsent(false);
  }, [
    videoKey,
    autoMusic,
    content,
    title,
    visibility,
    privacy,
    madeForKids,
    synthetic,
    interactions,
  ]);
  async function connect(platform: string) {
    await action(async () => {
      if (!profile) throw Error("Pilih profil Zernio terlebih dahulu");
      const result = await api("/connect", { platform, profileId: profile });
      window.location.assign(result.authUrl);
    });
  }
  return (
    <div className="stack-lg">
      {message && (
        <p role="status" className="alert alert-block">
          {message}
        </p>
      )}
      {credentials && (
        <section className="card pad stack">
          <div className="field-row">
            <h2 className="h3">Koneksi Zernio · YouTube / TikTok</h2>
            <button
              className="btn btn-sec"
              disabled={busy}
              onClick={() => void action(load)}
            >
              Perbarui akun dan status
            </button>
          </div>
          <p className="muted">
            {connection.reason || "Memeriksa koneksi…"} Masukkan Key Zernio di
            halaman Kredensial.
          </p>
          {connection.state === "connected" && (
            <>
              <label className="field">
                Profil Zernio
                <select
                  value={profile}
                  onChange={(e) => {
                    const profileId = e.target.value;
                    void action(async () => {
                      await api("/profile", { profileId });
                      await load();
                    });
                  }}
                  disabled={busy}
                >
                  <option value="" disabled>
                    Pilih profil
                  </option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field-row">
                <input
                  aria-label="Nama profil baru"
                  placeholder="Nama profil baru"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                />
                <button
                  className="btn btn-sec"
                  disabled={busy || !profileName.trim()}
                  onClick={() =>
                    void action(async () => {
                      const p = await api("/profiles", { name: profileName });
                      await api("/profile", { profileId: p.id });
                      await load();
                      setProfileName("");
                    })
                  }
                >
                  Buat profil
                </button>
              </div>
              <div className="toolbar">
                <button
                  className="btn btn-pri"
                  disabled={busy || !profile}
                  onClick={() => void connect("youtube")}
                >
                  Hubungkan YouTube
                </button>
                <button
                  className="btn btn-pri"
                  disabled={busy || !profile}
                  onClick={() => void connect("tiktok")}
                >
                  Hubungkan TikTok
                </button>
              </div>
              <ul>
                {connection.accounts.map((a) => (
                  <li key={a.id}>
                    {a.platform === "youtube" ? "YouTube" : "TikTok"} · @
                    {a.username}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      {settings && (
        <section className="stack">
          <fieldset className="output-targets">
            <legend>Target sosmed</legend>
            <div className="output-target-options">
              {(
                [
                  ["instagram", "Instagram"],
                  ["youtube", "YouTube"],
                  ["tiktok", "TikTok"],
                ] as const
              ).map(([platform, label]) => (
                <label className="check-row" key={platform}>
                  <input
                    type="checkbox"
                    checked={socialTargets(settings).includes(platform)}
                    onChange={(e) =>
                      onChange?.({
                        socialTargets: e.target.checked
                          ? [...socialTargets(settings), platform]
                          : socialTargets(settings).filter(
                              (target) => target !== platform,
                            ),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="settings-grid">
            {(
              [
                {
                  label: "Instagram",
                  key: "instagramAccountId",
                  state: instagram?.state || "loading",
                  accounts: instagram?.accounts || [],
                },
                {
                  label: "TikTok",
                  key: "tiktokAccountId",
                  state: connection.state,
                  accounts: connection.accounts.filter(
                    (a) => a.platform === "tiktok",
                  ),
                },
                {
                  label: "YouTube",
                  key: "youtubeAccountId",
                  state: connection.state,
                  accounts: connection.accounts.filter(
                    (a) => a.platform === "youtube",
                  ),
                },
              ] as const
            )
              .filter(({ key }) =>
                socialTargets(settings).includes(
                  key.replace("AccountId", "") as SocialTarget,
                ),
              )
              .map(({ label, key, state, accounts }) => (
                <label className="field" key={key}>
                  Akun tujuan {label}
                  <select
                    aria-label={`Akun tujuan ${label}`}
                    value={settings[key] || ""}
                    onChange={(e) =>
                      onChange?.({ [key]: e.target.value || null })
                    }
                    disabled={state === "loading"}
                  >
                    <option value="">Pilih akun tujuan</option>
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
              ))}
          </div>
          {socialTargets(settings).includes("tiktok") && (
            <TikTokSettingsFields
              accountId={settings.tiktokAccountId}
              value={settings.tiktok}
              onChange={(tiktok) => onChange?.({ tiktok })}
            />
          )}
        </section>
      )}
      {!settings && !credentials && connection.state !== "connected" && (
        <p>{connection.reason || "Memuat koneksi…"}</p>
      )}
      {!settings && !credentials && connection.state === "connected" && (
        <section className="card pad stack">
          <h2 className="h3">Posting video / carousel</h2>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                const result = await api("/posts", {
                  mediaKey: videoKey,
                  autoMusic,
                  accountId,
                  content,
                  title,
                  visibility,
                  privacy,
                  madeForKids,
                  synthetic,
                  consent,
                  ...interactions,
                });
                setConsent(false);
                await load();
                setMessage(`Status posting: ${result.status}`);
                onPublished?.();
              });
            }}
          >
            <label className="field">
              Jenis konten
              <select
                value={mediaType}
                onChange={(e) => {
                  setMediaType(e.target.value as "video" | "photo");
                  setVideoKey("");
                  setAccountId(publication?.accountId || "");
                  setConsent(false);
                }}
              >
                <option value="video">Video · YouTube / TikTok</option>
                {publication?.platform !== "youtube" && (
                  <option value="photo">Carousel · TikTok</option>
                )}
              </select>
            </label>
            <label className="field">
              Konten hasil produksi
              <select
                value={videoKey}
                onChange={(e) => {
                  setVideoKey(e.target.value);
                  const v = videos.find((x) => x.key === e.target.value);
                  setTitle(
                    v?.title.slice(0, mediaType === "photo" ? 90 : 100) || "",
                  );
                }}
                required
              >
                <option value="">Pilih konten buku atau berita</option>
                {videos
                  .filter((v) => v.mediaType === mediaType)
                  .map((v) => (
                    <option key={v.key} value={v.key}>
                      {v.title}
                    </option>
                  ))}
              </select>
            </label>
            {!videos.some((v) => v.mediaType === mediaType) && (
              <p className="muted">
                Belum ada konten jenis ini. Buat video atau panel di Produksi
                buku atau berita terlebih dahulu.
              </p>
            )}
            {video?.mediaType === "photo" && (
              <div className="stock-grid">
                {video.previews.map((url, i) => (
                  <figure key={url}>
                    <img src={url} alt={`Slide ${i + 1}`} />
                    <figcaption>Slide {i + 1}</figcaption>
                  </figure>
                ))}
              </div>
            )}
            {video?.mediaType === "video" && (
              <video
                key={video.previews[0]}
                controls
                preload="metadata"
                src={video.previews[0]}
                style={{ maxWidth: "100%", maxHeight: 400 }}
              />
            )}
            <label className="field">
              Akun tujuan
              <select
                required
                value={accountId}
                disabled={!!publication}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">Pilih akun</option>
                {connection.accounts
                  .filter(
                    (a) =>
                      (!publication || a.platform === publication.platform) &&
                      (mediaType === "video" || a.platform === "tiktok"),
                  )
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.platform} · @{a.username}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Caption / deskripsi
              <textarea
                required
                value={content}
                maxLength={
                  account?.platform === "tiktok"
                    ? mediaType === "photo"
                      ? 4000
                      : 2200
                    : 5000
                }
                onChange={(e) => setContent(e.target.value)}
              />
            </label>
            {mediaType === "photo" && (
              <>
                <label className="field">
                  Judul carousel
                  <input
                    required
                    maxLength={90}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={autoMusic}
                    onChange={(e) => setAutoMusic(e.target.checked)}
                  />{" "}
                  Tambahkan musik otomatis dari TikTok
                </label>
              </>
            )}
            {account?.platform === "youtube" && (
              <>
                <label className="field">
                  Judul YouTube
                  <input
                    required
                    maxLength={100}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label className="field">
                  Visibilitas
                  <select
                    required
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value)}
                  >
                    <option value="">Pilih visibilitas</option>
                    <option value="public">Publik</option>
                    <option value="private">Pribadi</option>
                    <option value="unlisted">Tidak publik</option>
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={madeForKids}
                    onChange={(e) => setMadeForKids(e.target.checked)}
                  />{" "}
                  Video dibuat khusus untuk anak-anak
                </label>
              </>
            )}
            {account?.platform === "tiktok" && (
              <>
                <p>Akun TikTok: {creator?.nickname || "Memuat…"}</p>
                <label className="field">
                  Privasi TikTok
                  <select
                    required
                    value={privacy}
                    onChange={(e) => setPrivacy(e.target.value)}
                    disabled={!creator}
                  >
                    <option value="">Pilih privasi</option>
                    {creator?.privacyLevels.map((p: any) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                {[
                  ["allow_comment", "Izinkan komentar"],
                  ["allow_duet", "Izinkan duet"],
                  ["allow_stitch", "Izinkan stitch"],
                ]
                  .filter(
                    ([k]) => mediaType === "video" || k === "allow_comment",
                  )
                  .map(([k, label]) => (
                    <label key={k}>
                      <input
                        type="checkbox"
                        disabled={!creator?.interactions[k]}
                        checked={!!interactions[k]}
                        onChange={(e) =>
                          setInteractions({
                            ...interactions,
                            [k]: e.target.checked,
                          })
                        }
                      />{" "}
                      {label}
                    </label>
                  ))}
              </>
            )}
            <label>
              <input
                type="checkbox"
                checked={synthetic}
                onChange={(e) => setSynthetic(e.target.checked)}
              />{" "}
              Konten mengandung materi sintetis / AI
            </label>
            <label>
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />{" "}
              Saya sudah meninjau konten dan caption serta menyetujui pengiriman
              ke akun yang dipilih.
            </label>
            {mediaType === "photo" && synthetic && (
              <p className="muted">
                Carousel AI dikirim ke draft TikTok. Selesaikan penandaan AI dan
                publikasinya di aplikasi TikTok.
              </p>
            )}
            <button
              className="btn btn-pri"
              disabled={
                busy ||
                !video ||
                !account ||
                !consent ||
                (account.platform === "tiktok" && !creator?.canPostMore)
              }
            >
              {mediaType === "photo" && synthetic
                ? "Kirim ke draft TikTok"
                : "Kirim konten"}
            </button>
          </form>
        </section>
      )}
      {!settings && !credentials && (
        <section className="card pad stack">
          <h2 className="h3">Riwayat posting</h2>
          {!posts.length && <p className="muted">Belum ada posting.</p>}
          {posts.map((p) => (
            <div key={p.id} className="stack-sm">
              <b>{p.title}</b>
              <span>
                {p.platform} · {p.status}
              </span>
              {p.status === "unknown" && (
                <small>Periksa dashboard Zernio sebelum mengirim ulang.</small>
              )}
              {p.result?.platforms?.map((t: any, i: number) => (
                <span key={i}>
                  {t.draft
                    ? "Draft diterima TikTok; selesaikan di aplikasi TikTok"
                    : t.status}{" "}
                  {t.error}
                  {t.url && (
                    <a href={t.url} target="_blank" rel="noreferrer">
                      Lihat posting
                    </a>
                  )}
                </span>
              ))}
              <button
                className="btn btn-sec btn-sm"
                disabled={busy || !p.post_id}
                onClick={() =>
                  void action(async () => {
                    await api(`/posts/${p.id}/refresh`, {});
                    await load();
                    onPublished?.();
                  })
                }
              >
                Periksa status
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
