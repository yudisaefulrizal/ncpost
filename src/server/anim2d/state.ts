// Keadaan bersama mesin gambar Video Animasi 2D (port core.js Nus 2D Studio).
// renderFrame(t) hanya bergantung pada t: tanpa Date.now, Math.random, atau
// keadaan antar-frame; acak semu memakai rnd(seed).
export interface Word {
  w: string;
  s: number;
  e: number;
  p?: string;
}
export interface Chunk {
  words: Word[];
  s: number;
  e: number;
}
export type Obj = Record<string, any>;
export interface Scene {
  layout: "stage" | "outro";
  mood: string;
  narration: string;
  title: string;
  hl: string[];
  comp?: string;
  items?: Obj[];
  links?: Obj[];
  focusSlot?: string;
  focus?: { x: number; y: number; z: number };
  nus?: { pose?: string; side?: "l" | "r"; s?: number };
  icon?: string;
  cta?: string;
  objects: Obj[];
  start: number;
  end: number;
  dur: number;
  words: Word[];
  chunks: Chunk[];
  prev?: Scene | null;
}
export interface Video {
  W: number;
  H: number;
  brand: string;
  world: string;
  total: number;
  scenes: Scene[];
  nusTrack?: { t0: number; t1: number; x0: number; x1: number }[];
}

// Gaya: sinematik gelap, ilustrasi lembut tanpa garis tepi, kata kunci kuning.
export const PAL = {
  bg: "#141B2B",
  fg: "#F3F5FA",
  dark: "#1B1B2F",
  paper: "#F4EFE6",
  win: "#FFD98A",
  c: ["#FFD23F", "#FF6B4A", "#5BB5F0"],
};

export let V: Video;
export let W = 0,
  H = 0,
  PT = false,
  S = 1;
export function useVideo(v: Video) {
  V = v;
  W = v.W;
  H = v.H;
  PT = H > W;
  S = Math.min(W, H) / 1080;
}
export const cl = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const prog = (t: number, s: number, d = 0.5) => cl((t - s) / d);
export const ease = {
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  back: (t: number) => {
    const c1 = 1.70158,
      c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inOut: (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
};
/** Ukuran desain 1080 ke piksel keluaran. */
export const u = (n: number) => n * S;
export const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
export const norm = (s: unknown) =>
  String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const rnd = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
export const fx = (n: number) => n.toFixed(2);

// Token warna yang boleh dipakai naskah.
export function palette(idx: number): Record<string, string> {
  return {
    a: PAL.c[idx % 3],
    b: PAL.c[(idx + 1) % 3],
    c: PAL.c[(idx + 2) % 3],
    fg: PAL.fg,
    f: PAL.dark,
    dark: PAL.dark,
    bg: PAL.bg,
    card: PAL.paper,
    paper: PAL.paper,
    w: "#fff",
    white: "#fff",
    sun: "#FFC83D",
    skin: "#FFD2A6",
    yellow: "#FFD23F",
    orange: "#FF8A3D",
    red: "#E5484D",
    blue: "#5BB5F0",
    green: "#3DDC97",
    brown: "#8A5A3C",
    slate: "#8E9DB3",
    slateDark: "#5F7089",
    black: "#0E1220",
  };
}

// Waktu kemunculan: saat kata pemicunya diucapkan (dibatasi agar layar tidak
// kosong lama).
export function cueTime(sc: Scene, cue: string, i: number, n: number) {
  if (cue) {
    const k = norm(cue);
    const w = sc.words.find((x) => k && norm(x.w).includes(k));
    if (w) return Math.min(Math.max(0.25, w.s - 0.12), 1.0 + i * 1.8);
  }
  return Math.min(
    0.55 + ((sc.dur - 1.6) * 0.75 * i) / Math.max(n, 1),
    1.0 + i * 1.8,
  );
}
export function objAt(sc: Scene, o: Obj, i: number, n: number) {
  return Math.min(
    o.cue ? cueTime(sc, o.cue, i, n) : 0.25 + i * 0.38 + (o.d || 0),
    0.4 + i * 0.75,
    Math.max(0.6, sc.dur - 1.8),
  );
}
/** Animasi muncul (setara pop() CSS): opacity, geser ke atas, skala. */
export function pop(lt: number, at: number, d = 0.55, rise = 50) {
  const p = prog(lt, at, d);
  return {
    opacity: cl(p * 3),
    dy: (1 - p) * rise * S,
    scale: 0.55 + 0.45 * ease.back(p),
  };
}
/** Warna CSS rgba(...) ke atribut SVG warna + opacity. */
export function rgba(css: string) {
  const m = /rgba?\(([^)]+)\)/.exec(css);
  if (!m) return { color: css, opacity: 1 };
  const [r, g, b, a = "1"] = m[1].split(",").map((x) => x.trim());
  return { color: `rgb(${r},${g},${b})`, opacity: Number(a) };
}
