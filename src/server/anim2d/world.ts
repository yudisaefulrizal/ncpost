// Dunia latar Video Animasi 2D (port world.js + background() Nus 2D Studio):
// langit, kabut, debu, siluet bergerak pelan, dan tanah tempat Nus berdiri.
import { PAL, PT, S, V, W, H, rnd, rgba, fx } from "./state";

type WorldCfg = {
  sky: [string, string];
  fog: string;
  ground: [string, string];
  edge: string;
  dust: string;
  grass?: boolean;
  water?: boolean;
};
export const WORLD_CFG: Record<string, WorldCfg> = {
  city: {
    sky: ["#1A2236", "#0F1524"],
    fog: "rgba(120,140,190,.10)",
    ground: ["#2B3550", "#141A29"],
    edge: "#3E4B70",
    dust: "#FFB347",
  },
  tech: {
    sky: ["#161B3A", "#0C1024"],
    fog: "rgba(110,120,230,.10)",
    ground: ["#252C55", "#11142E"],
    edge: "#4C57A0",
    dust: "#8C9BFF",
  },
  nature: {
    sky: ["#16282B", "#0D1718"],
    fog: "rgba(120,200,170,.08)",
    ground: ["#5A3D2B", "#241812"],
    edge: "#2F6F4E",
    dust: "#FFB347",
    grass: true,
  },
  ocean: {
    sky: ["#12304A", "#0A1A2B"],
    fog: "rgba(120,190,240,.10)",
    ground: ["#1D5F8F", "#0B2740"],
    edge: "#5BB5F0",
    dust: "#BFE6FF",
    water: true,
  },
  space: {
    sky: ["#0E0B20", "#05040F"],
    fog: "rgba(150,120,230,.08)",
    ground: ["#4B4A63", "#1B1A2B"],
    edge: "#6C6A8E",
    dust: "#FFFFFF",
  },
  lab: {
    sky: ["#1B2433", "#101824"],
    fog: "rgba(120,220,210,.08)",
    ground: ["#34445C", "#182130"],
    edge: "#4D6283",
    dust: "#7CE0D0",
  },
};
const cfgOf = () => WORLD_CFG[V.world] || WORLD_CFG.city;

export const groundY = () => (PT ? H * 0.655 : H * 0.8);
const SIL = "#8FA3C7";

// Siluet di atas garis tanah gy; tile berulang agar bergerak mulus.
function tile(fn: () => string, speed: number, t: number, Tw: number) {
  const ox = -((t * speed) % Tw);
  return `<g transform="translate(${ox.toFixed(1)},0)">${fn()}</g><g transform="translate(${(ox + Tw).toFixed(1)},0)">${fn()}</g>`;
}

const SCENERY: Record<string, (t: number, gy: number, Tw: number) => string> = {
  city: (t, gy, Tw) => {
    const bld = (L: number, op: number, win: boolean) => () => {
      const n = Math.round(Tw / (115 * S)),
        w = Tw / n;
      let s = "";
      for (let i = 0; i < n; i++) {
        const h = (70 + rnd(i + L * 50) * 190) * S * (L ? 1 : 1.25),
          x = i * w;
        s += `<rect x="${fx(x)}" y="${fx(gy - h)}" width="${fx(w - 6 * S)}" height="${fx(h)}" rx="${fx(5 * S)}" fill="${SIL}" opacity="${op}"/>`;
        if (win)
          for (let r = 0; r < h / (34 * S) - 1; r++)
            for (let k = 0; k < 3; k++)
              if (rnd(i * 31 + r * 7 + k) > 0.55)
                s += `<rect x="${fx(x + (14 + k * 30) * S)}" y="${fx(gy - h + (16 + r * 34) * S)}" width="${fx(14 * S)}" height="${fx(18 * S)}" rx="${fx(3 * S)}" fill="${PAL.win}" opacity=".5"/>`;
      }
      return s;
    };
    return (
      tile(bld(0, 0.09, false), 4 * S, t, Tw) +
      tile(bld(1, 0.16, true), 10 * S, t, Tw)
    );
  },
  tech: (t, gy, Tw) => {
    const rack = (L: number, op: number) => () => {
      const n = Math.round(Tw / (130 * S)),
        w = Tw / n;
      let s = "";
      for (let i = 0; i < n; i++) {
        const h = (90 + rnd(i + L * 40) * 200) * S,
          x = i * w;
        s += `<rect x="${fx(x)}" y="${fx(gy - h)}" width="${fx(w - 10 * S)}" height="${fx(h)}" rx="${fx(8 * S)}" fill="${SIL}" opacity="${op}"/>`;
        if (L)
          for (let r = 0; r < h / (30 * S) - 1; r++) {
            const on = Math.sin(t * 3 + i * 2 + r) > 0.2;
            s += `<rect x="${fx(x + 12 * S)}" y="${fx(gy - h + (14 + r * 30) * S)}" width="${fx(w - 34 * S)}" height="${fx(8 * S)}" rx="${fx(4 * S)}" fill="#000" opacity=".25"/><circle cx="${fx(x + w - 26 * S)}" cy="${fx(gy - h + (18 + r * 30) * S)}" r="${fx(3.5 * S)}" fill="${on ? "#6CFFB0" : "#000"}" opacity="${on ? 0.8 : 0.3}"/>`;
          }
      }
      return s;
    };
    return (
      tile(rack(0, 0.09), 3 * S, t, Tw) + tile(rack(1, 0.17), 8 * S, t, Tw)
    );
  },
  nature: (t, gy, Tw) => {
    const hills = () => {
      let s = "";
      const n = 4;
      for (let i = 0; i < n; i++)
        s += `<ellipse cx="${fx(((i + 0.5) * Tw) / n)}" cy="${fx(gy)}" rx="${fx((Tw / n) * 0.8)}" ry="${fx((70 + rnd(i) * 90) * S)}" fill="${SIL}" opacity=".08"/>`;
      return s;
    };
    const trees = () => {
      let s = "";
      const n = Math.round(Tw / (150 * S));
      for (let i = 0; i < n; i++) {
        const x = ((i + 0.3 + rnd(i) * 0.4) * Tw) / n,
          h = (80 + rnd(i + 9) * 90) * S;
        s += `<rect x="${fx(x - 6 * S)}" y="${fx(gy - h * 0.3)}" width="${fx(12 * S)}" height="${fx(h * 0.3)}" fill="${SIL}" opacity=".14"/><polygon points="${fx(x - 38 * S)},${fx(gy - h * 0.25)} ${fx(x)},${fx(gy - h)} ${fx(x + 38 * S)},${fx(gy - h * 0.25)}" fill="${SIL}" opacity=".15"/>`;
      }
      return s;
    };
    return (
      `<circle cx="${fx(W * 0.8)}" cy="${fx(gy - 240 * S)}" r="${fx(60 * S)}" fill="#FFE9A8" opacity=".10"/>` +
      tile(hills, 3 * S, t, Tw) +
      tile(trees, 9 * S, t, Tw)
    );
  },
  ocean: (t, gy) => {
    const bx = ((t * 18 * S) % (W + 300 * S)) - 150 * S;
    return `<circle cx="${fx(W * 0.78)}" cy="${fx(gy - 170 * S)}" r="${fx(70 * S)}" fill="#CFE9FF" opacity=".10"/><g transform="translate(${bx.toFixed(1)},${fx(gy - 40 * S)})" opacity=".3"><polygon points="0,0 0,${fx(-90 * S)} ${fx(55 * S)},0" fill="#fff"/><path d="M${fx(-25 * S)} 0 L${fx(80 * S)} 0 L${fx(60 * S)} ${fx(20 * S)} L${fx(-5 * S)} ${fx(20 * S)} Z" fill="#9FB0CC"/></g>`;
  },
  space: (t, gy, Tw) => {
    let s = "";
    for (let i = 0; i < 60; i++)
      s += `<circle cx="${fx(rnd(i) * W)}" cy="${fx(rnd(i + 99) * gy)}" r="${fx((1 + rnd(i + 5) * 2.5) * S)}" fill="#fff" opacity="${(0.2 + 0.4 * Math.abs(Math.sin(t * 1.6 + i))).toFixed(2)}"/>`;
    s += `<g transform="translate(${fx(W * 0.82)},${fx(H * 0.15)}) rotate(-20)" opacity=".5"><circle r="${fx(85 * S)}" fill="#7A6CD8"/><ellipse rx="${fx(140 * S)}" ry="${fx(30 * S)}" fill="none" stroke="#B5A8FF" stroke-width="${fx(10 * S)}"/></g>`;
    const mt = () => {
      let p = "";
      const n = 5;
      for (let i = 0; i < n; i++) {
        const x = (i * Tw) / n,
          h = (60 + rnd(i + 3) * 120) * S;
        p += `<polygon points="${fx(x)},${fx(gy)} ${fx(x + Tw / n / 2)},${fx(gy - h)} ${fx(x + Tw / n)},${fx(gy)}" fill="${SIL}" opacity=".12"/>`;
      }
      return p;
    };
    return s + tile(mt, 5 * S, t, Tw);
  },
  lab: (t, gy, Tw) => {
    const gear = (x: number, y: number, r: number, dir: number) => {
      let teeth = "";
      for (let i = 0; i < 8; i++)
        teeth += `<rect x="${fx(-r * 0.16)}" y="${fx(-r * 1.25)}" width="${fx(r * 0.32)}" height="${fx(r * 0.4)}" fill="${SIL}" transform="rotate(${i * 45})"/>`;
      return `<g transform="translate(${fx(x)},${fx(y)}) rotate(${fx(t * 18 * dir)})" opacity=".12"><circle r="${fx(r)}" fill="${SIL}"/>${teeth}<circle r="${fx(r * 0.4)}" fill="#0F1624"/></g>`;
    };
    const flasks = () => {
      let s = "";
      const n = 5;
      for (let i = 0; i < n; i++) {
        const x = ((i + 0.5) * Tw) / n,
          h = (80 + rnd(i) * 80) * S,
          w = h * 0.7;
        s += `<g opacity=".14" fill="${SIL}"><rect x="${fx(x - w * 0.12)}" y="${fx(gy - h)}" width="${fx(w * 0.24)}" height="${fx(h * 0.35)}"/><polygon points="${fx(x - w * 0.12)},${fx(gy - h * 0.65)} ${fx(x + w * 0.12)},${fx(gy - h * 0.65)} ${fx(x + w / 2)},${fx(gy)} ${fx(x - w / 2)},${fx(gy)}"/></g>`;
      }
      return s;
    };
    return (
      gear(W * 0.14, H * 0.14, 60 * S, 1) +
      gear(W * 0.9, H * 0.3, 46 * S, -1.4) +
      tile(flasks, 5 * S, t, Tw)
    );
  },
};

/** Langit bergradasi, tiga kabut, dan debu yang melayang. */
export function background(t: number) {
  const cfg = cfgOf();
  const fog = rgba(cfg.fog);
  let s = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cfg.sky[0]}"/><stop offset="1" stop-color="${cfg.sky[1]}"/></linearGradient><radialGradient id="fog" cx=".5" cy=".5" r=".7071"><stop offset="0" stop-color="${fog.color}" stop-opacity="${fog.opacity}"/><stop offset=".7" stop-color="${fog.color}" stop-opacity="0"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  for (let i = 0; i < 3; i++) {
    const x = (((i * 0.37 + t * 0.012 * (i + 1)) % 1.4) - 0.2) * W,
      y = H * (0.2 + i * 0.22);
    s += `<rect x="${fx(x - W * 0.5)}" y="${fx(y - H * 0.18)}" width="${W}" height="${fx(H * 0.36)}" fill="url(#fog)"/>`;
  }
  for (let i = 0; i < 46; i++) {
    const sp = 0.012 + rnd(i + 5) * 0.03,
      x = (rnd(i) + Math.sin(t * 0.4 + i) * 0.02) * W;
    const y = ((((rnd(i + 50) - t * sp) % 1) + 1) % 1) * H;
    const r = (1.5 + rnd(i + 9) * 3) * S,
      tw = 0.25 + 0.5 * Math.abs(Math.sin(t * 1.3 + i));
    s += `<circle cx="${fx(x + r / 2)}" cy="${fx(y + r / 2)}" r="${fx(r / 2)}" fill="${cfg.dust}" opacity="${(tw * 0.8).toFixed(2)}"/>`;
  }
  return s;
}

/** Siluet latar dan tanah (air untuk dunia laut). */
export function world(idx: number, t: number) {
  const gy = groundY(),
    cfg = cfgOf();
  const kind = SCENERY[V.world] ? V.world : "city";
  const scenery = SCENERY[kind](t, gy, W);
  const gid = "g" + idx;
  let top = "";
  if (cfg.water) {
    let d = `M0 ${H}`;
    for (let x = 0; x <= W + 20; x += 20)
      d += ` L${x} ${(gy + Math.sin(x / (90 * S) + t * 1.4) * 8 * S).toFixed(1)}`;
    top = `<path d="${d} L${W} ${H} Z" fill="url(#${gid})"/>`;
  } else {
    top = `<rect x="0" y="${fx(gy)}" width="${W}" height="${fx(H - gy)}" fill="url(#${gid})"/><rect x="0" y="${fx(gy)}" width="${W}" height="${fx(5 * S)}" fill="${cfg.edge}"/>`;
    if (cfg.grass) {
      let g = "";
      for (let x = 0; x < W; x += 18 * S)
        g += `<path d="M${fx(x)} ${fx(gy)} l${fx(3 * S)} ${fx(-11 * S)} l${fx(3 * S)} ${fx(11 * S)}" fill="none" stroke="${cfg.edge}" stroke-width="${fx(2.5 * S)}" stroke-linecap="round" opacity=".8"/>`;
      top += g;
    }
  }
  let strata = "";
  for (let i = 1; i <= 5; i++)
    strata += `<line x1="0" y1="${fx(gy + (i * (H - gy)) / 6)}" x2="${W}" y2="${fx(gy + (i * (H - gy)) / 6)}" stroke="#000" stroke-opacity=".14" stroke-width="${fx(3 * S)}"/>`;
  return `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cfg.ground[0]}"/><stop offset="1" stop-color="${cfg.ground[1]}"/></linearGradient></defs>${scenery}${top}${cfg.water ? "" : strata}`;
}
