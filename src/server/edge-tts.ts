import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, statSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { ROOT, privateEnv } from "./config";

const run = promisify(execFile);
export function newsTtsConfig() {
  const executable =
    process.env.EDGE_TTS_EXECUTABLE ||
    path.join(ROOT, "data/edge-tts/bin/edge-tts");
  const enabled =
    process.env.NEWS_EDGE_TTS !== "false" && existsSync(executable);
  return {
    executable,
    enabled,
    provider: "edge-tts",
    voice: process.env.NEWS_EDGE_TTS_VOICE || "id-ID-ArdiNeural",
    rate: process.env.NEWS_EDGE_TTS_RATE || "+0%",
    reason:
      process.env.NEWS_EDGE_TTS === "false"
        ? "Edge TTS berita dinonaktifkan (NEWS_EDGE_TTS=false)"
        : enabled
          ? "Edge TTS berita aktif"
          : "Edge TTS belum terpasang; jalankan instalasi TTS berita",
  };
}

// Input melalui berkas agar teks panjang tidak terkena batas argumen proses.
// Tidak memakai shell dan tidak beralih ke ElevenLabs ketika layanan gagal.
export async function edgeTts(
  text: string,
  file: string,
  config = newsTtsConfig(),
) {
  if (!config.enabled) throw Error(config.reason);
  if (!text.trim()) throw Error("Teks audio berita kosong");
  const input = `${file}.txt`;
  writeFileSync(input, text, { mode: 0o600 });
  try {
    await run(
      config.executable,
      [
        "--file",
        input,
        "--voice",
        config.voice,
        `--rate=${config.rate}`,
        "--write-media",
        file,
      ],
      { timeout: 120000, maxBuffer: 1024 * 1024, env: privateEnv() },
    );
    if (!existsSync(file) || statSync(file).size < 100)
      throw Error("Edge TTS tidak menghasilkan audio MP3");
  } catch (error) {
    rmSync(file, { force: true });
    throw Error(`Edge TTS gagal: ${(error as Error).message}`);
  } finally {
    rmSync(input, { force: true });
  }
}
