import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import type mysql from "mysql2/promise";
import { ROOT } from "./config";
import { outputRoot } from "./output-paths";
import { safeFile } from "./templates";
import { stockPart } from "./media-stock";
import { listVoices } from "./voices";
export type AudioStock = {
  id: number;
  text: string;
  file: string;
  provider: string;
  voice: string;
  voiceName: string;
  updatedAt: string;
};
export async function listAudioStock(db: mysql.Pool): Promise<AudioStock[]> {
  const [rows]: any = await db.query(
    "SELECT id,identity_name,source_text,file,updated_at FROM media_stock WHERE category='audio' ORDER BY id DESC",
  );
  const voices = await listVoices(db);
  return rows.map((row: any): AudioStock => {
    const [provider, voice] = row.identity_name.split("__");
    const match = voices.find(
      (item) =>
        item.provider === provider && stockPart(item.voice_id) === voice,
    );
    return {
      id: row.id,
      text: row.source_text,
      file: row.file,
      provider,
      voice,
      voiceName: match?.name || voice,
      updatedAt: row.updated_at,
    };
  });
}
export function filterAudioStock(
  rows: AudioStock[],
  filter: { q?: unknown; provider?: unknown; voice?: unknown },
) {
  const query =
    typeof filter.q === "string" ? filter.q.trim().toLowerCase() : "";
  return rows.filter(
    (row) =>
      (!filter.provider || row.provider === filter.provider) &&
      (!filter.voice || `${row.provider}__${row.voice}` === filter.voice) &&
      (!query ||
        `${row.text} ${row.voiceName} ${row.voice}`
          .toLowerCase()
          .includes(query)),
  );
}
export function audioStockFile(file: string) {
  return safeFile(
    path.join(outputRoot(), "stock-audio"),
    path.join(ROOT, file),
  );
}
export function audioDownloadName(text: string, extension = ".wav") {
  if (Array.from(text).length > 230) return null;
  const name = stockPart(text);
  return name.length <= 230 ? name + extension : null;
}
export async function convertAudioDownload(
  source: string,
  destination: string,
) {
  try {
    await promisify(execFile)(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-i",
        source,
        "-map",
        "0:a:0",
        "-vn",
        "-c:a",
        "pcm_s16le",
        "-ac",
        "1",
        "-ar",
        "44100",
        "-f",
        "wav",
        destination,
      ],
      { timeout: 120000, maxBuffer: 1024 * 1024 },
    );
  } catch {
    throw Error(
      "Konversi audio ke WAV gagal; periksa audio dan ffmpeg di server",
    );
  }
}
export async function createAudioZip(rows: AudioStock[], destination: string) {
  const eligible = rows.filter((row) => audioDownloadName(row.text));
  if (!eligible.length)
    throw Error(
      "Tidak ada audio dengan teks maksimal 230 karakter untuk diunduh",
    );
  const stage = await mkdtemp(
    path.join(path.dirname(destination), "audio-files-"),
  );
  try {
    const files: string[] = [];
    const used = new Set<string>();
    for (const row of eligible) {
      const source = audioStockFile(row.file);
      const name = audioDownloadName(row.text);
      if (!name) continue;
      const relative = name;
      // Identical narration filenames share one entry; do not add identifiers.
      if (used.has(relative)) continue;
      used.add(relative);
      await convertAudioDownload(source, path.join(stage, relative));
      files.push(relative);
    }
    await new Promise<void>((resolve, reject) => {
      const child = spawn("zip", ["-q", destination, "-@"], {
        cwd: stage,
        shell: false,
        stdio: ["pipe", "ignore", "ignore"],
      });
      const timer = setTimeout(() => child.kill("SIGKILL"), 120000);
      child.on("error", () => {
        clearTimeout(timer);
        reject(
          Error("Pembuatan ZIP gagal; program zip belum tersedia di server"),
        );
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(Error("Pembuatan ZIP audio gagal"));
      });
      child.stdin.on("error", () => {});
      child.stdin.end(files.join("\n") + "\n");
    });
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
