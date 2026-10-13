import React, { useEffect, useState } from "react";
import { api } from "./api";
type Voice = {
  id: number;
  name: string;
  provider: string;
  voice_id: string;
  is_default: number;
};
export function VoiceSelect({
  value,
  onChange,
}: {
  value?: number | null;
  onChange: (value: number | null) => void;
}) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api("/voices", "GET", undefined, null)
      .then((rows) => {
        if (active) setVoices(rows);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <label className="field">
      Suara narasi
      <select
        value={value || ""}
        onChange={(e) =>
          onChange(e.target.value ? Number(e.target.value) : null)
        }
      >
        <option value="">Gunakan suara default</option>
        {value && !voices.some((voice) => voice.id === value) && (
          <option value={value}>Suara #{value}</option>
        )}
        {voices.map((voice) => (
          <option key={voice.id} value={voice.id}>
            {voice.name} ·{" "}
            {voice.provider === "elevenlabs" ? "ElevenLabs" : "Edge TTS"}
          </option>
        ))}
      </select>
      {error && (
        <small role="alert" className="warn">
          {error}
        </small>
      )}
    </label>
  );
}
export function Voices() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const empty = {
    name: "",
    provider: "elevenlabs",
    voice_id: "",
    is_default: false,
  };
  const [draft, setDraft] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [audios, setAudios] = useState<Record<number, string>>({});
  const load = async () =>
    setVoices(await api("/voices", "GET", undefined, null));
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  const act = async (run: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await run();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card pad stack">
      <div className="card-title">
        <h2 className="h3">Daftar Suara</h2>
        <button
          className="btn btn-sec"
          disabled={busy}
          onClick={() => {
            setEditing(null);
            setDraft(empty);
          }}
        >
          Tambah suara
        </button>
      </div>
      <p className="muted">
        Suara default digunakan saat Pengaturan Konten belum memilih suara. Jika
        belum ada default, aplikasi memakai suara dari Kredensial untuk
        ElevenLabs dan konfigurasi Edge TTS untuk berita.
      </p>
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void act(async () => {
            await api(
              editing ? `/voices/${editing}` : "/voices",
              editing ? "PUT" : "POST",
              draft,
              null,
            );
            setDraft(empty);
            setEditing(null);
            await load();
          });
        }}
      >
        <div className="voice-form-grid">
          <label className="field">
            Nama suara
            <input
              required
              maxLength={190}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="field">
            Penyedia
            <select
              value={draft.provider}
              onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
            >
              <option value="elevenlabs">ElevenLabs</option>
              <option value="edge-tts">Edge TTS</option>
            </select>
          </label>
          <label className="field">
            Voice ID
            <input
              required
              maxLength={190}
              value={draft.voice_id}
              placeholder={
                draft.provider === "edge-tts"
                  ? "id-ID-ArdiNeural"
                  : "Voice ID ElevenLabs"
              }
              onChange={(e) => setDraft({ ...draft, voice_id: e.target.value })}
            />
          </label>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={draft.is_default}
            onChange={(e) =>
              setDraft({ ...draft, is_default: e.target.checked })
            }
          />
          Jadikan default untuk penyedia ini
        </label>
        <div>
          <button className="btn btn-pri" disabled={busy}>
            {busy
              ? "Memproses…"
              : editing
                ? "Simpan perubahan"
                : "Simpan suara"}
          </button>
        </div>
      </form>
      <small className="muted">
        Tes ElevenLabs menggunakan kredit untuk satu kalimat pendek.
      </small>
      <div className="table">
        <table>
          <thead>
            <tr>
              <th>Suara</th>
              <th>Penyedia</th>
              <th>Voice ID</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {voices.map((voice) => (
              <tr key={voice.id}>
                <td>
                  {voice.name}
                  {voice.is_default ? " · Default" : ""}
                </td>
                <td>
                  {voice.provider === "elevenlabs" ? "ElevenLabs" : "Edge TTS"}
                </td>
                <td>{voice.voice_id}</td>
                <td>
                  <div className="toolbar">
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() => {
                        setEditing(voice.id);
                        setDraft({ ...voice, is_default: !!voice.is_default });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          const data = await api(
                            `/voices/${voice.id}/test`,
                            "POST",
                            undefined,
                            null,
                          );
                          setAudios((old) => ({
                            ...old,
                            [voice.id]: data.url,
                          }));
                        })
                      }
                    >
                      Tes
                    </button>
                    {!voice.is_default && (
                      <button
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await api(
                              `/voices/${voice.id}`,
                              "PUT",
                              { ...voice, is_default: true },
                              null,
                            );
                            await load();
                          })
                        }
                      >
                        Jadikan default
                      </button>
                    )}
                  </div>
                  {audios[voice.id] && (
                    <audio controls src={audios[voice.id]} preload="none" />
                  )}
                </td>
              </tr>
            ))}
            {!voices.length && (
              <tr>
                <td colSpan={4}>
                  Belum ada suara. Tambahkan Voice ID untuk mulai.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
