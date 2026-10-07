import { bookKey } from "../server/domain";
// Pemetaan status mentah (DB/job) ke enam status semantik sistem desain.
export type Tone = "ok" | "run" | "act" | "block" | "check" | "none";
export type Status = { tone: Tone; label: string };

const map: Record<string, Status> = {
  siap: { tone: "ok", label: "Lolos" },
  tersedia: { tone: "ok", label: "Tersedia" },
  completed: { tone: "ok", label: "Selesai" },
  published: { tone: "ok", label: "Terbit" },
  running: { tone: "run", label: "Berjalan" },
  queued: { tone: "run", label: "Antre" },
  processing: { tone: "run", label: "Diproses" },
  revisi: { tone: "act", label: "Revisi" },
  "menunggu editor": { tone: "act", label: "Tunggu editor" },
  draft: { tone: "act", label: "Draf" },
  failed: { tone: "block", label: "Gagal" },
  unknown: { tone: "block", label: "Tidak pasti" },
  cancelled: { tone: "none", label: "Batal" },
  belum: { tone: "none", label: "Belum" },
};

export function status(raw: unknown): Status {
  const s = String(raw ?? "belum");
  if (s.startsWith("tersedia")) return map.tersedia;
  return map[s] ?? { tone: "none", label: s };
}

export const ACTION_STATES = ["revisi", "draft", "menunggu editor"];

// Satu langkah berikutnya per bab (hukum Hick: satu pilihan utama per baris).
export function nextStep(c: any): string {
  if (!c.article) return "Buat artikel";
  if (c.article_status === "draft") return "Perbaiki draf";
  if (c.article_status === "revisi") return "Sunting draf";
  if (c.article_status === "menunggu editor") return "Review editor";
  if (
    c.article_status === "siap" &&
    !String(c.visual_status).startsWith("tersedia")
  )
    return "Buat gambar";
  return "Lihat detail";
}

export type Filter = "semua" | "tindakan" | "lanjut" | "belum";
export function matchFilter(c: any, f: Filter) {
  if (f === "tindakan") return ACTION_STATES.includes(c.article_status);
  if (f === "lanjut") return c.article_status === "siap";
  if (f === "belum") return !c.article;
  return true;
}

// Kelompokkan baris berurutan per buku (Gestalt: kedekatan).
export function groupByBook<T extends { book: string }>(rows: T[]) {
  const groups: { book: string; rows: T[] }[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && bookKey(last.book) === bookKey(r.book)) last.rows.push(r);
    else groups.push({ book: r.book, rows: [r] });
  }
  return groups;
}
