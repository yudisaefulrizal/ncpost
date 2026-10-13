import path from "node:path";
import { spawn } from "node:child_process";
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
export async function createAudioZip(rows: AudioStock[], destination: string) {
  if (!rows.length) throw Error("Tidak ada audio untuk diunduh");
  const root = path.join(outputRoot(), "stock-audio");
  const files = [
    ...new Set(
      rows.map((row) => path.relative(root, audioStockFile(row.file))),
    ),
  ];
  if (files.some((file) => /[\r\n]/.test(file)))
    throw Error("Nama file audio tidak valid");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("zip", ["-q", destination, "-@"], {
      cwd: root,
      shell: false,
      stdio: ["pipe", "ignore", "pipe"],
    });
    let error = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 120000);
    child.stderr.on("data", (data) => {
      if (error.length < 4000) error += data.toString();
    });
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
}
