// Adegan berbasis template (comp + item di slot) menjadi objek panggung
// berkoordinat untuk format yang sedang dirender (port layout.js).
import { COMPS, COMP_LS_SCALE, COMP_SIZES, GROUND_ONLY } from "./catalog";
import { H, PT, V, W, cl, type Obj } from "./state";
import { stageGeom } from "./stage";
import { groundY } from "./world";

function slotGeom(comp: string, name: string) {
  const slot = COMPS[comp]?.slots[name];
  if (!slot) return null;
  const G = stageGeom(),
    m = Math.min(G.boxW, G.boxH),
    spec = PT ? slot.pt : slot.ls;
  const left = (W - G.boxW) / 2;
  const sizePx =
    m * (COMP_SIZES[spec[2] || "M"] || COMP_SIZES.M) * (PT ? 1 : COMP_LS_SCALE);
  return {
    slot,
    px: left + spec[0] * G.boxW,
    py: G.top + spec[1] * G.boxH,
    sizePx,
    wFrac: slot.w ? slot.w[PT ? 0 : 1] : null,
  };
}

// Piksel layar -> koordinat kanvas logis (kebalikan stageGeom().mx/my).
function toCanvas(px: number, py: number) {
  const G = stageGeom(),
    sx = cl(G.boxW / G.boxH, 1, 2.2);
  return {
    x: 500 + (px - W / 2) / (sx * G.k),
    y: ((py - G.top) / G.boxH) * 1000,
  };
}

function placeItem(comp: string, it: Obj): Obj[] {
  const sg = slotGeom(comp, it.slot);
  if (!sg) return [];
  const G = stageGeom(),
    k = G.k;
  const o: Obj = { ...it };
  delete o.slot;
  delete o.to;
  delete o.count;
  let size = sg.sizePx;
  if (o.t === "icon") size *= 0.62;
  let py = sg.py;
  if (sg.slot.ground) py = groundY() - size * 0.44;
  const c = toCanvas(sg.px, py);
  Object.assign(o, { x: c.x, y: c.y, s: size / k });
  if (o.t === "counter") o.s = (sg.sizePx * 0.45) / k;
  if (o.t === "bars") {
    o.w = (sg.sizePx * 1.2) / k;
    o.h = (sg.sizePx * 0.75) / k;
  }
  // Lebar maksimum teks dalam satuan kanvas; huruf dikecilkan bila perlu.
  o.maxw = (G.boxW * (sg.wFrac || (PT ? 0.9 : 0.5))) / k;
  if (o.t === "note") {
    o.w = (G.boxW * (sg.wFrac || 0.9)) / k;
    o.s = PT ? 70 : 62;
  }
  if (o.t === "text") o.s = PT ? 50 : 44;
  if (o.t === "bubble") o.s = PT ? 46 : 40;
  // Benda tanah di slot melayang diberi lingkaran latar agar terbaca sebagai ikon.
  if (o.t === "prop" && GROUND_ONLY.includes(o.n) && !sg.slot.ground)
    o.tile = true;
  if (it.to?.slot) {
    const tg = slotGeom(comp, it.to.slot);
    if (tg) {
      const ts = tg.sizePx * (o.t === "icon" ? 0.62 : 1),
        ty = tg.slot.ground ? groundY() - ts * 0.44 : tg.py;
      const tc = toCanvas(tg.px, ty);
      o.mv = [
        {
          cue: it.to.cue || "",
          x: tc.x,
          y: tc.y,
          s: o.t === "counter" ? (tg.sizePx * 0.45) / k : ts / k,
          d: 0.9,
        },
      ];
    }
  }
  // Beberapa benda sejenis berjajar di tanah (mis. api).
  const n = sg.slot.ground ? Math.min(3, Math.max(1, it.count || 1)) : 1;
  if (n === 1) return [o];
  return Array.from({ length: n }, (_, j) => {
    const dx = (j - (n - 1) / 2) * size * 0.95,
      cc = toCanvas(sg.px + dx, py),
      main = j === Math.floor(n / 2);
    return {
      ...o,
      id: o.id ? (j === 0 ? o.id : `${o.id}_${j}`) : undefined,
      x: cc.x,
      s: (size * (main ? 1 : 0.8)) / k,
      y: toCanvas(sg.px, groundY() - size * (main ? 1 : 0.8) * 0.44).y,
    };
  });
}

function placeLinks(comp: string, links: Obj[] | undefined): Obj[] {
  return (links || []).flatMap((l) => {
    const a = slotGeom(comp, l.from),
      b = slotGeom(comp, l.to);
    if (!a || !b) return [];
    const dx = b.px - a.px,
      dy = b.py - a.py,
      len = Math.hypot(dx, dy) || 1,
      ux = dx / len,
      uy = dy / len;
    const ra = a.sizePx * 0.45 + 10,
      rb = b.sizePx * 0.45 + 18;
    if (len < ra + rb + 20) return [];
    const p1 = toCanvas(a.px + ux * ra, a.py + uy * ra),
      p2 = toCanvas(b.px - ux * rb, b.py - uy * rb);
    return [
      {
        t: "arrow",
        x: p1.x,
        y: p1.y,
        x2: p2.x,
        y2: p2.y,
        cue: l.cue || "",
        dash: !!l.dash,
        a: "pop",
        loop: "none",
      },
    ];
  });
}

// Perkiraan lebar benda (px) agar zoom tidak mendorong apa pun keluar layar.
function objectWidthPx(o: Obj, k: number) {
  const len = String(o.v || "").length;
  if (o.t === "text") {
    const fs = Math.min(o.s || 52, o.maxw ? o.maxw / (len * 0.58 + 1) : 999);
    return (len * 0.58 + 1) * fs * k;
  }
  if (o.t === "counter") {
    const t = (
      String(o.prefix || "") +
      String(o.v) +
      (o.suffix ? " " + o.suffix : "")
    ).length;
    return (
      t *
      0.62 *
      Math.min(o.s || 100, (PT ? 700 : 1500) / Math.max(1, t * 0.62)) *
      k
    );
  }
  if (o.t === "note") return (o.w || 820) * k;
  if (o.t === "bars") return (o.w || 360) * k;
  if (o.t === "bubble" || o.t === "badge")
    return Math.min(o.maxw || 400, 420) * k;
  return (o.s || 200) * (o.t === "icon" && o.bg ? 1.44 : 1) * k;
}

// Zoom terbesar (<= diminta) yang menjaga semua benda tetap di dalam layar.
function fitZoom(objects: Obj[], focusPx: number, want: number) {
  const G = stageGeom(),
    cx = G.mx(500),
    gy = groundY();
  const items = objects.filter((o) => o.t !== "line" && o.t !== "arrow");
  for (let z = want; z > 1.0001; z -= 0.01) {
    const tx = cl(cx - z * focusPx, W - z * W, 0);
    const ok = items.every((o) => {
      const half = objectWidthPx(o, G.k) / 2,
        x = G.mx(o.x),
        top = G.my(o.y) - ((o.s || 200) * G.k) / 2;
      return (
        tx + z * (x - half) >= W * 0.02 &&
        tx + z * (x + half) <= W * 0.98 &&
        gy - z * (gy - top) >= H * 0.04
      );
    });
    if (ok) return z;
  }
  return 1;
}

/** Hitung objek berkoordinat dan fokus kamera tiap adegan (sekali per video). */
export function resolveScenes() {
  for (const sc of V.scenes) {
    if (sc.layout !== "stage" || !sc.comp || !COMPS[sc.comp]) {
      sc.objects = [];
      continue;
    }
    sc.objects = (sc.items || [])
      .flatMap((it) => placeItem(sc.comp!, it))
      .concat(placeLinks(sc.comp, sc.links));
    if (sc.focusSlot) {
      const f = slotGeom(sc.comp, sc.focusSlot);
      if (f) {
        const c = toCanvas(f.px, f.py);
        sc.focus = {
          x: c.x,
          y: c.y,
          z: fitZoom(sc.objects, f.px, PT ? 1.15 : 1.12),
        };
      }
    }
  }
}
