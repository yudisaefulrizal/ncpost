// Proses langsung di atas kepala karyawan kantor. Worker mencatat teks proses
// per job (lewat konteks async, jadi kode di dalam job cukup memanggil live())
// ke data/live.json; server membacanya lalu meneruskannya ke browser lewat
// WebSocket. Hanya beberapa karakter terakhir yang disimpan dan tidak ada
// perubahan skema DB.
import { AsyncLocalStorage } from "node:async_hooks";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  watchFile,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { ROOT } from "./config";

/** Karakter terakhir yang tampil di atas kepala karyawan. */
export const LIVE_CHARS = 80;
// Entri yang tidak diperbarui selama ini dianggap sisa proses yang terhenti.
const LIVE_STALE_MS = 10 * 60000;
const FLUSH_MS = 300;

export type LiveEntry = { key: string; kind: string; text: string; at: number };
type LiveContext = { key: string; kind: string };

export const liveFile = () =>
  path.join(
    ROOT,
    "data",
    process.env.NCPOST_TEST === "true" ? "live.test.json" : "live.json",
  );

const context = new AsyncLocalStorage<LiveContext>();
const entries = new Map<string, LiveEntry>();
let timer: NodeJS.Timeout | null = null;

/** Rapikan teks proses: satu baris, tanpa spasi berlebih, ekor LIVE_CHARS. */
export function liveTail(text: string, chars = LIVE_CHARS) {
  const line = text
    .replace(/[`*_#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return line.length > chars ? "…" + line.slice(-(chars - 1)) : line;
}

function flush(file = liveFile()) {
  timer = null;
  const now = Date.now();
  for (const [key, e] of entries)
    if (now - e.at > LIVE_STALE_MS) entries.delete(key);
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify([...entries.values()]));
    renameSync(tmp, file);
  } catch {
    // Tampilan saja; kegagalan menulis tidak boleh mengganggu produksi.
  }
}
const schedule = () => {
  if (!timer) timer = setTimeout(() => flush(), FLUSH_MS);
};

/** Jalankan fn dengan konteks proses langsung; entrinya dihapus saat selesai. */
export async function withLive<T>(
  key: string,
  kind: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await context.run({ key, kind }, fn);
  } finally {
    if (entries.delete(key)) schedule();
  }
}

/** Jalankan fn sebagai karyawan lain (mis. Jurnalis) di job yang sama. */
export function asLive<T>(kind: string, fn: () => Promise<T>): Promise<T> {
  const ctx = context.getStore();
  return ctx ? context.run({ key: ctx.key, kind }, fn) : fn();
}

/** Catat teks proses job yang sedang berjalan (tanpa konteks: diabaikan). */
export function live(text: string, kind?: string) {
  const ctx = context.getStore();
  const tail = liveTail(text);
  if (!ctx || !tail) return;
  entries.set(ctx.key, {
    key: ctx.key,
    kind: kind ?? ctx.kind,
    text: tail,
    at: Date.now(),
  });
  schedule();
}

/** Teks yang layak tampil dari satu baris event Codex --json. */
export function codexLiveText(line: string): string | null {
  let e: any;
  try {
    e = JSON.parse(line);
  } catch {
    return null;
  }
  const item = e?.item;
  if (!item || !["item.started", "item.completed"].includes(e.type))
    return null;
  if (["web_search", "web_search_call"].includes(item.type)) {
    const query = item.query ?? item.action?.query;
    return query ? `Mencari: ${query}` : "Mencari di web…";
  }
  if (item.type === "reasoning" && typeof item.text === "string")
    return item.text;
  if (item.type === "agent_message" && typeof item.text === "string")
    return item.text;
  return null;
}

/** Server: baca entri terbaru dari berkas worker. */
export function readLive(file = liveFile()): LiveEntry[] {
  try {
    if (!existsSync(file)) return [];
    const list = JSON.parse(readFileSync(file, "utf8"));
    const now = Date.now();
    return Array.isArray(list)
      ? list.filter((e) => now - Number(e?.at) <= LIVE_STALE_MS)
      : [];
  } catch {
    return [];
  }
}

/** Server: panggil onChange tiap kali worker memperbarui berkas. */
export function watchLive(
  onChange: (entries: LiveEntry[]) => void,
  file = liveFile(),
) {
  watchFile(file, { interval: 400 }, () => onChange(readLive(file)));
}
