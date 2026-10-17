// Suasana kantor mengikuti jam WIB: pagi, siang, sore, malam. Nilai di antara
// titik jam dicampur linear supaya pergantian suasana terasa halus.
export type AmbienceName = "pagi" | "siang" | "sore" | "malam";
export type AmbienceMode = "otomatis" | AmbienceName;
export const AMBIENCE_LABEL: Record<AmbienceMode, string> = {
  otomatis: "Otomatis",
  pagi: "Pagi",
  siang: "Siang",
  sore: "Sore",
  malam: "Malam",
};

export type Ambience = {
  background: string;
  sky: string;
  ground: string;
  hemi: number;
  sun: string;
  sunIntensity: number;
  /** Arah datang cahaya matahari/bulan (x, y, z dari titik tengah kantor). */
  sunDir: [number, number, number];
  /** Cahaya jendela (warna dan kuat pendar). */
  window: string;
  windowGlow: number;
  /** Pengali pendar layar monitor, papan nama, dan hologram. */
  screenGlow: number;
  /** Kuat lampu ruangan (0 = mati). */
  lamps: number;
};

export const AMBIENCE: Record<AmbienceName, Ambience> = {
  pagi: {
    background: "#1d3557",
    sky: "#ffe2bd",
    ground: "#5a4632",
    hemi: 1.5,
    sun: "#ffc98a",
    sunIntensity: 2.2,
    sunDir: [15, 8, 5],
    window: "#ffd9a3",
    windowGlow: 0.6,
    screenGlow: 1,
    lamps: 0,
  },
  siang: {
    background: "#0b1220",
    sky: "#cfdcff",
    ground: "#4a3a28",
    hemi: 1.7,
    sun: "#fff1dc",
    sunIntensity: 2.4,
    sunDir: [9, 16, 7],
    window: "#cfe6ff",
    windowGlow: 0.5,
    screenGlow: 1,
    lamps: 0,
  },
  sore: {
    background: "#2a1b2e",
    sky: "#ffc59a",
    ground: "#4f3424",
    hemi: 1.35,
    sun: "#ff9a52",
    sunIntensity: 2.1,
    sunDir: [-15, 7, 6],
    window: "#ffb070",
    windowGlow: 0.7,
    screenGlow: 1.2,
    lamps: 0.4,
  },
  malam: {
    background: "#04070f",
    sky: "#3a4f86",
    ground: "#1b1626",
    hemi: 0.55,
    sun: "#9fb4ff",
    sunIntensity: 0.45,
    sunDir: [-6, 14, -8],
    window: "#ffcf7a",
    windowGlow: 1.6,
    screenGlow: 2.2,
    lamps: 1,
  },
};

// Titik jam WIB → suasana; di antaranya dicampur.
const KEYS: [number, AmbienceName][] = [
  [0, "malam"],
  [4.5, "malam"],
  [6.5, "pagi"],
  [9.5, "pagi"],
  [11, "siang"],
  [14.5, "siang"],
  [16, "sore"],
  [17.5, "sore"],
  [19, "malam"],
  [24, "malam"],
];

/** Jam WIB pecahan (0–24) untuk waktu epoch ms. */
export const wibHour = (now: number) => (((now / 3600000 + 7) % 24) + 24) % 24;

/** Suasana yang sedang berlaku (untuk label). */
export function ambienceName(hour: number): AmbienceName {
  if (hour >= 5 && hour < 10) return "pagi";
  if (hour >= 10 && hour < 15) return "siang";
  if (hour >= 15 && hour < 18) return "sore";
  return "malam";
}

const hex = (c: string) =>
  [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const toHex = (rgb: number[]) =>
  "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixColor = (a: string, b: string, t: number) => {
  const [x, y] = [hex(a), hex(b)];
  return toHex(x.map((v, i) => mix(v, y[i], t)));
};

export function blendAmbience(a: Ambience, b: Ambience, t: number): Ambience {
  return {
    background: mixColor(a.background, b.background, t),
    sky: mixColor(a.sky, b.sky, t),
    ground: mixColor(a.ground, b.ground, t),
    hemi: mix(a.hemi, b.hemi, t),
    sun: mixColor(a.sun, b.sun, t),
    sunIntensity: mix(a.sunIntensity, b.sunIntensity, t),
    sunDir: a.sunDir.map((v, i) =>
      mix(v, b.sunDir[i], t),
    ) as Ambience["sunDir"],
    window: mixColor(a.window, b.window, t),
    windowGlow: mix(a.windowGlow, b.windowGlow, t),
    screenGlow: mix(a.screenGlow, b.screenGlow, t),
    lamps: mix(a.lamps, b.lamps, t),
  };
}

/** Suasana pada jam WIB tertentu, atau suasana tetap bila dipilih manual. */
export function ambienceAt(mode: AmbienceMode, hour: number): Ambience {
  if (mode !== "otomatis") return AMBIENCE[mode];
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [h0, a] = KEYS[i];
    const [h1, b] = KEYS[i + 1];
    if (hour >= h0 && hour <= h1) {
      const t = h1 === h0 ? 0 : (hour - h0) / (h1 - h0);
      return blendAmbience(AMBIENCE[a], AMBIENCE[b], t);
    }
  }
  return AMBIENCE.malam;
}
