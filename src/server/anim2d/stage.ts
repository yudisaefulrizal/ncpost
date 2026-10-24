// Panggung ilustrasi Video Animasi 2D (port stage.js Nus 2D Studio).
// Objek disusun di kanvas logis 1000x1000 (x: 0-1000 pusat 500; y: 0 = atas,
// 1000 = garis tanah). Pada landscape posisi x direnggangkan ke samping;
// ukuran objek tidak berubah. Objek ber-id sama di adegan berikutnya
// dipindahkan (tween), objek yang tidak dilanjutkan keluar dengan animasi.
import { iconMarkup } from "./icons";
import { PROPS } from "./props";
import {
  H,
  PT,
  W,
  cl,
  cueTime,
  ease,
  esc,
  lerp,
  objAt,
  palette,
  prog,
  rnd,
  type Obj,
  type Scene,
} from "./state";
import { groundY } from "./world";

export function stageGeom() {
  const gy = groundY(),
    top = H * (PT ? 0.075 : 0.085);
  const boxW = W * 0.88,
    boxH = gy - top;
  const k = (Math.min(boxW, boxH) / 1000) * 1.12;
  const sx = cl(boxW / boxH, 1, 2.2);
  return {
    k,
    top,
    boxH,
    boxW,
    mx: (x: number) => W / 2 + (x - 500) * sx * k,
    my: (y: number) => top + (y / 1000) * boxH,
  };
}
type Geom = ReturnType<typeof stageGeom>;
type Pos = { x: number; y: number; s: number; rot: number };

const lum = (hex: string) => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  return (
    (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  );
};
const isLine = (o: Obj) => o.t === "line" || o.t === "arrow";
const HEX = /^#[0-9a-f]{3,8}$/i;

// Pecah teks panjang jadi maksimal 2 baris.
function wrap2(text: string, limit: number) {
  if (text.length <= limit) return [text];
  const mid = text.length / 2;
  let best = -1;
  for (let i = 0; i < text.length; i++)
    if (
      text[i] === " " &&
      (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))
    )
      best = i;
  return best < 0 ? [text] : [text.slice(0, best), text.slice(best + 1)];
}
function tornPath(w: number, h: number, seed: number) {
  const x0 = -w / 2,
    x1 = w / 2,
    y0 = -h / 2,
    y1 = h / 2;
  let d = `M${x0} ${y0}`;
  for (let x = x0 + 22; x < x1; x += 22)
    d += ` L${x.toFixed(0)} ${(y0 + (rnd(x + seed) - 0.5) * 8).toFixed(1)}`;
  d += ` L${x1} ${y0} L${x1} ${y1}`;
  for (let x = x1 - 22; x > x0; x -= 22)
    d += ` L${x.toFixed(0)} ${(y1 + (rnd(x * 3 + seed) - 0.5) * 8).toFixed(1)}`;
  return d + ` L${x0} ${y1} Z`;
}

// ---------- keadaan objek terhadap waktu ----------
function moves(sc: Scene, o: Obj, i: number, n: number) {
  return ((o.mv || []) as Obj[]).map((m) => ({
    tm: m.cue ? cueTime(sc, m.cue, i, n) : m.at || 1,
    m,
  }));
}
export function posAt(
  sc: Scene,
  o: Obj,
  i: number,
  n: number,
  lt: number,
): Pos {
  let cur: Pos = { x: o.x, y: o.y, s: o.s, rot: o.rot || 0 },
    from = cur;
  for (const { tm, m } of moves(sc, o, i, n)) {
    if (lt < tm) break;
    const to = {
      x: m.x ?? from.x,
      y: m.y ?? from.y,
      s: m.s ?? from.s,
      rot: m.rot ?? from.rot,
    };
    const p = ease.inOut(prog(lt, tm, m.d || 0.8));
    cur = {
      x: lerp(from.x, to.x, p),
      y: lerp(from.y, to.y, p),
      s: lerp(from.s, to.s, p),
      rot: lerp(from.rot, to.rot, p),
    };
    from = to;
  }
  return cur;
}
function finalPos(o: Obj): Pos {
  let f: Pos = { x: o.x, y: o.y, s: o.s, rot: o.rot || 0 };
  for (const m of o.mv || [])
    f = { x: m.x ?? f.x, y: m.y ?? f.y, s: m.s ?? f.s, rot: m.rot ?? f.rot };
  return f;
}
const exitTime = (sc: Scene, o: Obj, i: number, n: number, at: number) =>
  o.out ? Math.max(at + 0.8, cueTime(sc, o.out, i, n)) : null;

export function carriedFrom(prev: Scene | null | undefined, o: Obj) {
  return o.id && prev && !isLine(o)
    ? (prev.objects || []).find((q) => q.id === o.id && q.t === o.t)
    : undefined;
}

// ---------- isi objek ----------
function objectBody(
  o: Obj,
  P: Record<string, string>,
  st: { lt: number; at: number },
) {
  const { lt, at } = st,
    size = o.s || 200,
    col = P[o.c] || (HEX.test(o.c || "") ? o.c : P.a);
  const col2 = P[o.c2] || (HEX.test(o.c2 || "") ? o.c2 : P.b),
    col3 = P[o.c3] || (HEX.test(o.c3 || "") ? o.c3 : P.c),
    t = o.t;
  if (t === "icon") {
    const inner = iconMarkup(o.n),
      ic = o.bg ? (lum(col) > 0.6 ? P.dark : "#fff") : col;
    const g = `<g transform="translate(${-size / 2},${-size / 2}) scale(${size / 24})" fill="none" stroke="${ic}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
    return o.bg
      ? `<circle r="${size * 0.72}" fill="${col}"/><g transform="scale(.92)">${g}</g>`
      : g;
  }
  if (t === "prop") {
    const fn = PROPS[o.n] || PROPS.person;
    const art = fn({
      ...P,
      a: col,
      b: col2,
      c: col3,
      txt: esc(o.v || ""),
      txt2: esc(o.v2 || ""),
    });
    // Benda tanah di slot melayang diberi lingkaran latar (terbaca sebagai ikon).
    if (o.tile)
      return `<circle r="${size * 0.56}" fill="${P.slateDark}" fill-opacity=".55"/><g transform="scale(${(size * 0.8) / 100})">${art}</g>`;
    return `<g transform="scale(${size / 100})">${art}</g>`;
  }
  if (t === "bars") {
    const vals: number[] = (o.vals || [3, 5, 8]).slice(0, 8),
      m = Math.max(...vals, 1e-9),
      bw = (o.w || 360) / vals.length,
      hh = o.h || 300;
    return (
      vals
        .map((v, j) => {
          const q = ease.out(prog(lt, at + j * 0.12, 0.7)),
            bh = (v / m) * hh * q;
          return `<rect x="${-(o.w || 360) / 2 + j * bw + bw * 0.1}" y="${hh / 2 - bh}" width="${bw * 0.8}" height="${bh}" rx="10" fill="${[col, col2, col3][j % 3]}"/>`;
        })
        .join("") +
      `<line x1="${-(o.w || 360) / 2 - 10}" y1="${hh / 2 + 4}" x2="${(o.w || 360) / 2 + 10}" y2="${hh / 2 + 4}" stroke="${P.fg}" stroke-opacity=".6" stroke-width="6" stroke-linecap="round"/>`
    );
  }
  if (t === "text") {
    const raw = String(o.v || ""),
      txt = esc(raw),
      fs = Math.min(
        o.s || 52,
        o.maxw ? o.maxw / (raw.length * 0.58 + 1.0) : 999,
      ),
      wch = raw.length * fs * 0.58 + fs * 1.0;
    return o.plain
      ? `<text text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="800" fill="${o.c ? col : P.fg}">${txt}</text>`
      : `<rect x="${-wch / 2}" y="${-fs * 0.85}" width="${wch}" height="${fs * 1.7}" rx="${fs * 0.5}" fill="${o.c ? col : P.paper}"/><text text-anchor="middle" dominant-baseline="central" y="${fs * 0.04}" font-size="${fs}" font-weight="800" fill="${P.dark}">${txt}</text>`;
  }
  if (t === "counter") {
    const v = (o.v || 0) * ease.out(prog(lt, at + 0.1, 1.4)),
      dec = (String(o.v).split(".")[1] || "").length;
    const raw =
      (o.prefix || "") +
      v.toLocaleString("id-ID", {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      }) +
      (o.suffix ? " " + o.suffix : "");
    const maxW = PT ? 700 : 1500,
      fsz = Math.min(size, maxW / Math.max(1, raw.length * 0.62));
    return `<text text-anchor="middle" dominant-baseline="central" font-size="${fsz.toFixed(1)}" font-weight="800" fill="${o.c ? col : "#fff"}" letter-spacing="-0.02em">${esc(raw)}</text>`;
  }
  if (t === "note") {
    let fs = o.s || 70;
    const w = o.w || 820,
      small = esc(o.small || ""),
      big = String(o.v || "");
    while (big.length * fs * 0.56 > w - 70 && fs > 34) fs -= 4;
    const lines = wrap2(big, Math.floor((w - 70) / (fs * 0.56))),
      h = (small ? fs * 0.5 : 0) + lines.length * fs * 1.15 + fs * 0.9;
    const y0 = -h / 2 + fs * 0.45;
    return (
      `<path d="${tornPath(w, h, Math.round(o.x))}" fill="${P.paper}"/>` +
      (small
        ? `<text x="${-w / 2 + 34}" y="${y0 + fs * 0.3}" font-size="${fs * 0.36}" font-weight="600" fill="#6B7280">${small}</text>`
        : "") +
      lines
        .map(
          (ln, j) =>
            `<text text-anchor="middle" x="0" y="${y0 + (small ? fs * 0.55 : 0) + fs * 0.78 + j * fs * 1.15}" font-size="${fs}" font-weight="800" fill="${P.dark}" letter-spacing="-0.02em">${esc(ln)}</text>`,
        )
        .join("")
    );
  }
  if (t === "badge") {
    const head = esc(o.head || ""),
      name = esc(o.v || ""),
      w = 300,
      h = 120;
    return (
      `<g transform="scale(${(size / 320).toFixed(3)})"><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="12" fill="${P.paper}"/><path d="M${-w / 2} ${-h / 2 + 12} a12 12 0 0 1 12 -12 h${w - 24} a12 12 0 0 1 12 12 v22 h${-w}z" fill="#E5484D"/>` +
      `<text x="${-w / 2 + 18}" y="${-h / 2 + 24}" font-size="19" font-weight="800" fill="#fff">${head}</text>` +
      `<circle cx="${-w / 2 + 44}" cy="14" r="22" fill="#9AA3B2"/><text x="${-w / 2 + 84}" y="8" font-size="26" font-weight="800" fill="${P.dark}">${name}</text><rect x="${-w / 2 + 84}" y="22" width="120" height="8" rx="4" fill="#C9C3B8"/></g>`
    );
  }
  if (t === "bubble") {
    const lines = wrap2(String(o.v || ""), 18),
      longest = Math.max(...lines.map((l) => l.length)),
      fs = Math.min(o.s || 44, o.maxw ? o.maxw / (longest * 0.56 + 1.2) : 999),
      w = longest * fs * 0.56 + fs * 1.2,
      h = lines.length * fs * 1.2 + fs * 0.8,
      tl = o.tail === "r" ? 1 : -1;
    return (
      `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${fs * 0.55}" fill="${P.paper}"/><path d="M${tl * (w / 2 - fs * 1.4)} ${h / 2 - 2} l${-tl * fs * 0.2} ${fs * 0.7} l${tl * fs * 0.9} ${-fs * 0.7}z" fill="${P.paper}"/>` +
      lines
        .map(
          (ln, j) =>
            `<text text-anchor="middle" x="0" y="${-h / 2 + fs * 0.4 + fs * 0.85 + j * fs * 1.2}" font-size="${fs}" font-weight="800" fill="${P.dark}">${esc(ln)}</text>`,
        )
        .join("")
    );
  }
  return "";
}

// Satu objek -> markup SVG. st: posisi, waktu muncul, jam animasi lokal,
// jam global, lanjutan adegan sebelumnya, dan progres keluar 0..1.
function drawObject(
  o: Obj,
  P: Record<string, string>,
  G: Geom,
  st: {
    pos: Pos;
    at: number;
    lt: number;
    t: number;
    carried: boolean;
    ex: number;
  },
  i: number,
) {
  const { k, mx, my } = G,
    { pos, at, lt, carried, ex } = st;
  const col = P[o.c] || (HEX.test(o.c || "") ? o.c : P.a);
  const p = carried ? 1 : prog(lt, at, 0.6),
    e = ease.back(p),
    eo = ease.out(p);
  const loopT = st.t * 2 + i;
  let ox = 0,
    oy = 0,
    scl = pos.s / (o.s || 200),
    rot = pos.rot,
    op = cl(p * 3) * (1 - ex);
  if (!carried) {
    const A = o.a || "pop",
      dist = 420 * k;
    if (A === "pop") scl *= 0.4 + 0.6 * e;
    else if (A === "slideL") ox = -(1 - eo) * dist;
    else if (A === "slideR") ox = (1 - eo) * dist;
    else if (A === "slideU") oy = -(1 - eo) * dist;
    else if (A === "slideD") oy = (1 - eo) * dist;
    else if (A === "grow") scl *= eo;
  }
  const loop = o.loop || "none";
  if (loop === "float") oy += Math.sin(loopT) * 14 * k;
  else if (loop === "spin") rot += st.t * 40;
  else if (loop === "pulse") scl *= 1 + 0.06 * Math.sin(loopT * 1.6);
  else if (loop === "wiggle") rot += Math.sin(loopT * 2.2) * 6;
  else if (loop === "sway") ox += Math.sin(loopT * 0.9) * 18 * k;
  if (ex > 0) {
    scl *= 1 - 0.25 * ex;
    oy -= 24 * k * ex;
  }

  if (isLine(o)) {
    const lc = o.c ? col : P.fg,
      x1 = mx(o.x),
      y1 = my(o.y),
      x2 = mx(o.x2),
      y2 = my(o.y2),
      w = 8 * k * (o.w || 1);
    const dx = x2 - x1,
      dy = y2 - y1,
      len = Math.hypot(dx, dy) || 1,
      ux = dx / len,
      uy = dy / len,
      hs = 34 * k;
    const tipX = x1 + (dx - (o.t === "arrow" ? ux * 10 * k : 0)) * eo,
      tipY = y1 + (dy - (o.t === "arrow" ? uy * 10 * k : 0)) * eo;
    const head =
      o.t === "arrow" && eo > 0.85
        ? `<polygon points="${x2},${y2} ${x2 - ux * hs - uy * hs * 0.55},${y2 - uy * hs + ux * hs * 0.55} ${x2 - ux * hs + uy * hs * 0.55},${y2 - uy * hs - ux * hs * 0.55}" fill="${lc}"/>`
        : "";
    return `<g filter="url(#sh)" opacity="${(1 - ex).toFixed(2)}"><line x1="${x1}" y1="${y1}" x2="${tipX}" y2="${tipY}" stroke="${lc}" stroke-width="${w}" stroke-linecap="round" ${o.dash ? `stroke-dasharray="${w * 1.6} ${w * 1.8}"` : ""}/>${head}</g>`;
  }
  if (o.t === "bars") op = (1 - ex) * cl(p * 3);
  if (op <= 0.001) return "";
  const body = objectBody(o, P, { lt, at });
  if (!body) return "";
  return `<g filter="url(#sh)" transform="translate(${(mx(pos.x) + ox).toFixed(1)},${(my(pos.y) + oy).toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${(k * Math.max(0.001, scl)).toFixed(4)})${o.flip ? " scale(-1,1)" : ""}" opacity="${op.toFixed(2)}">${body}</g>`;
}

/** Bayangan objek panggung (bergantung skala panggung). */
export function stageDefs() {
  const G = stageGeom();
  return `<filter id="sh" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="${(8 * G.k).toFixed(1)}" stdDeviation="${(8 * G.k).toFixed(1)}" flood-color="#000" flood-opacity=".4"/></filter>`;
}

/** Semua objek adegan pada jam lokal lt (judul adegan digambar terpisah). */
export function stage(sc: Scene, lt: number, ci: number) {
  const G = stageGeom(),
    P = palette(ci),
    objs = sc.objects,
    n = objs.length,
    tg = sc.start + lt;
  let out = "";

  // Objek adegan sebelumnya yang tidak dilanjutkan: keluar pelan.
  const prev = sc.prev;
  if (prev && lt < 0.5) {
    const pn = prev.objects.length;
    prev.objects.forEach((o, i) => {
      if (objs.some((q) => q.id && q.id === o.id && q.t === o.t && !isLine(o)))
        return;
      const pat = objAt(prev, o, i, pn),
        te = exitTime(prev, o, i, pn, pat);
      if (te !== null && te + 0.4 <= prev.dur) return; // sudah keluar
      out += drawObject(
        o,
        P,
        G,
        {
          pos: finalPos(o),
          at: pat,
          lt: prev.dur,
          t: tg,
          carried: false,
          ex: ease.inOut(prog(lt, 0, 0.45)),
        },
        i,
      );
    });
  }

  objs.forEach((o, i) => {
    const car = carriedFrom(prev, o),
      at = car ? 0 : objAt(sc, o, i, n);
    if (lt < at) return;
    let pos = posAt(sc, o, i, n, lt);
    if (car) {
      const F = finalPos(car),
        c = ease.inOut(prog(lt, 0, 0.7));
      pos = {
        x: lerp(F.x, pos.x, c),
        y: lerp(F.y, pos.y, c),
        s: lerp(F.s, pos.s, c),
        rot: lerp(F.rot, pos.rot, c),
      };
    }
    let ex = 0;
    const te = exitTime(sc, o, i, n, at);
    if (te !== null) {
      ex = prog(lt, te, 0.4);
      if (ex >= 1) return;
    }
    out += drawObject(o, P, G, { pos, at, lt, t: tg, carried: !!car, ex }, i);
  });
  return out;
}
