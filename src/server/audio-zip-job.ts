// Download batch stok audio sebagai pekerjaan latar belakang: konversi WAV dan
// ZIP berjalan di server, browser hanya memantau kemajuan lalu mengunduh hasil
// lewat link biasa. Satu pekerjaan pada satu waktu; statusnya di memori, jadi
// hilang saat server restart dan sisa filenya dibersihkan saat start.
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { outputRoot } from "./output-paths";
import {
  audioZipEntries,
  createAudioZip,
  type AudioStock,
} from "./audio-stock";

export const AUDIO_ZIP_TTL = 6 * 60 * 60 * 1000;
export type AudioZipJob = {
  id: string;
  status: "running" | "done" | "failed";
  done: number;
  total: number;
  failed: string[];
  error?: string;
  size?: number;
  expiresAt?: number;
};
let job: AudioZipJob | null = null;
let expiry: NodeJS.Timeout | undefined;
const folder = () => path.join(outputRoot(), "audio-download");
export const audioZipFile = (id: string) => path.join(folder(), `${id}.zip`);

export const audioZipStatus = () => job;

export async function clearAudioZips() {
  if (job?.status === "running") return;
  clearTimeout(expiry);
  job = null;
  await rm(folder(), { recursive: true, force: true });
}

// Status diset sinkron sebelum await pertama, jadi klik ganda atau dua tab
// tetap mendapat pekerjaan yang sama.
export function startAudioZip(rows: AudioStock[]): AudioZipJob {
  if (job?.status === "running") return job;
  const total = audioZipEntries(rows).length;
  if (!total)
    throw Error(
      "Tidak ada audio dengan teks maksimal 230 karakter untuk diunduh",
    );
  clearTimeout(expiry);
  const current: AudioZipJob = {
    id: randomUUID(),
    status: "running",
    done: 0,
    total,
    failed: [],
  };
  job = current;
  void (async () => {
    try {
      await rm(folder(), { recursive: true, force: true });
      await mkdir(folder(), { recursive: true, mode: 0o700 });
      const file = audioZipFile(current.id);
      await createAudioZip(rows, file, (done, failed) => {
        current.done = done;
        current.failed = [...failed];
      });
      current.size = (await stat(file)).size;
      current.expiresAt = Date.now() + AUDIO_ZIP_TTL;
      current.status = "done";
      expiry = setTimeout(() => void clearAudioZips(), AUDIO_ZIP_TTL);
      expiry.unref();
    } catch (error) {
      await rm(folder(), { recursive: true, force: true }).catch(() => {});
      current.error = (error as Error).message || "Pembuatan ZIP audio gagal";
      current.status = "failed";
    }
  })();
  return current;
}
