import type mysql from "mysql2/promise";
import { tts, ttsTimed } from "./providers";
import { edgeTts, newsTtsConfig } from "./edge-tts";
import { writeFileSync } from "node:fs";
export type Voice = {
  id: number | null;
  name: string;
  provider: "elevenlabs" | "edge-tts";
  voice_id: string;
  is_default?: number;
};
export async function listVoices(db: mysql.Pool) {
  const [rows]: any = await db.query(
    "SELECT * FROM voices ORDER BY provider,is_default DESC,name,id",
  );
  return rows as Voice[];
}
export async function saveVoice(db: mysql.Pool, input: any, id?: number) {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const voice =
    typeof input?.voice_id === "string" ? input.voice_id.trim() : "";
  if (
    !name ||
    name.length > 190 ||
    !/^[a-zA-Z0-9_-]{1,190}$/.test(voice) ||
    !["elevenlabs", "edge-tts"].includes(input?.provider)
  )
    throw Error("Nama, penyedia, atau Voice ID tidak valid");
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      "SELECT stage FROM process_timing_locks WHERE stage='audio' FOR UPDATE",
    );
    if (input.is_default)
      await connection.query(
        "UPDATE voices SET is_default=0 WHERE provider=?",
        [input.provider],
      );
    if (id) {
      const [result]: any = await connection.query(
        "UPDATE voices SET name=?,provider=?,voice_id=?,is_default=? WHERE id=?",
        [name, input.provider, voice, input.is_default ? 1 : 0, id],
      );
      if (!result.affectedRows) throw Error("Suara tidak ditemukan");
    } else {
      const [result]: any = await connection.query(
        "INSERT INTO voices(name,provider,voice_id,is_default) VALUES(?,?,?,?)",
        [name, input.provider, voice, input.is_default ? 1 : 0],
      );
      id = result.insertId;
    }
    await connection.commit();
    return id;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
export async function resolveVoice(
  db: mysql.Pool,
  id: number | null | undefined,
  provider: Voice["provider"],
): Promise<Voice> {
  const [rows]: any = id
    ? await db.query("SELECT * FROM voices WHERE id=?", [id])
    : await db.query(
        "SELECT * FROM voices WHERE provider=? AND is_default=1 ORDER BY id LIMIT 1",
        [provider],
      );
  if (rows[0]) return rows[0];
  if (id) throw Error("Suara yang dipilih tidak ditemukan");
  const voice =
    provider === "elevenlabs"
      ? process.env.ELEVENLABS_VOICE_ID || ""
      : newsTtsConfig().voice;
  if (!voice)
    throw Error("Pilih suara atau atur suara default di Daftar Suara");
  return { id: null, name: "Default Kredensial", provider, voice_id: voice };
}
export async function generateVoiceAudio(
  voice: Voice,
  text: string,
  file: string,
) {
  if (voice.provider === "edge-tts")
    return edgeTts(text, file, { ...newsTtsConfig(), voice: voice.voice_id });
  writeFileSync(
    file,
    await tts(text, {
      live: process.env.LIVE_TTS === "true",
      key: process.env.ELEVENLABS_API_KEY || "",
      voice: voice.voice_id,
    }),
  );
}
// Seperti generateVoiceAudio, ditambah waktu tiap huruf bila layanan suara
// menyediakannya (ElevenLabs). Edge TTS: null.
export async function generateTimedVoiceAudio(
  voice: Voice,
  text: string,
  file: string,
) {
  if (voice.provider === "edge-tts") {
    await generateVoiceAudio(voice, text, file);
    return null;
  }
  const config = {
    live: process.env.LIVE_TTS === "true",
    key: process.env.ELEVENLABS_API_KEY || "",
    voice: voice.voice_id,
  };
  try {
    const { audio, alignment } = await ttsTimed(text, config);
    writeFileSync(file, audio);
    return alignment;
  } catch (error) {
    if (!config.live || !config.key) throw error;
    // Bila endpoint bertiming menolak, audio biasa tetap dipakai.
    writeFileSync(file, await tts(text, config));
    return null;
  }
}
export function voiceRecipe(voice: Voice) {
  return voice.provider === "elevenlabs"
    ? { model: "eleven_v3" }
    : { rate: newsTtsConfig().rate };
}
