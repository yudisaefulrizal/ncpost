// Nus: maskot pixel-art bersendi dari asset/maskot/nus/nus_rig.js (port
// character.js Nus 2D Studio).
//  - Berdiri: tampak DEPAN. Berjalan: tampak SAMPING (menghadap arah jalan).
//  - Tenang: diam di satu tempat; berjalan hanya saat masuk, menunjuk benda
//    utama sekali per adegan, dan memegang pose suasana secara statis.
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../config";
import {
  H,
  PT,
  V,
  W,
  cl,
  ease,
  esc,
  fx,
  objAt,
  prog,
  type Scene,
} from "./state";
import { carriedFrom, posAt, stageGeom } from "./stage";
import { groundY } from "./world";

type Run = [number, number, number, number, string];
type Pivot = Record<string, [number, number]>;
interface Rig {
  w: number;
  h: number;
  parts: Record<string, Run[]>;
  patch: Run[];
  pivot: Pivot;
  side: { parts: Record<string, Run[]>; pivot: Pivot };
}
let rig: Rig | undefined;
const art: Record<string, string> = {};
function loadRig() {
  if (rig) return rig;
  const source = readFileSync(
    path.join(ROOT, "asset/maskot/nus/nus_rig.js"),
    "utf8",
  );
  rig = JSON.parse(
    source.replace(/^\s*window\.NUS_RIG\s*=\s*/, "").replace(/;\s*$/, ""),
  ) as Rig;
  const partSVG = (runs: Run[]) => {
    const byColor: Record<string, string[]> = {};
    for (const [x, y, w, h, c] of runs)
      (byColor[c] ||= []).push(
        `M${x} ${y}h${w + 0.04}v${h + 0.04}h${-(w + 0.04)}z`,
      );
    return Object.entries(byColor)
      .map(([c, d]) => `<path fill="${c}" d="${d.join("")}"/>`)
      .join("");
  };
  for (const [k, runs] of Object.entries(rig.parts)) art[k] = partSVG(runs);
  for (const [k, runs] of Object.entries(rig.side.parts))
    art["s_" + k] = partSVG(runs);
  art.patch = partSVG(rig.patch);
  return rig;
}

const EMOTE: Record<string, [string, string]> = {
  surprised: ["!", "#FF6B4A"],
  thinking: ["?", "#5BB5F0"],
  excited: ["★", "#FFD23F"],
  serious: ["…", "#8E9DB3"],
  happy: ["♪", "#3DDC97"],
};
const SIDE_X = { l: 0.09, c: 0.5, r: 0.91 };
const WALK_SPEED = () => W * 0.2;

// Posisi: Nus punya satu tempat tetap (kanan). Ia berjalan hanya saat masuk,
// atau bila naskah sengaja menyuruh pindah (nus.side).
export function nusTrackInit() {
  loadRig();
  const tr: NonNullable<typeof V.nusTrack> = [];
  let side: "l" | "r" | null = null,
    x: number | null = null;
  for (const sc of V.scenes) {
    const next: "l" | "r" = sc.nus?.side || side || "r";
    const tx = W * SIDE_X[next];
    if (x === null) x = next === "l" ? -W * 0.12 : W * 1.12; // masuk dari luar layar
    const dur = Math.abs(tx - x) / WALK_SPEED();
    tr.push({ t0: sc.start + 0.1, t1: sc.start + 0.1 + dur, x0: x, x1: tx });
    x = tx;
    side = next;
  }
  V.nusTrack = tr;
}

function nusPosition(t: number) {
  const track = V.nusTrack!;
  let seg = track[0];
  for (const s of track) if (t >= s.t0) seg = s;
  const dir = Math.sign(seg.x1 - seg.x0) || 1;
  if (t >= seg.t1 || seg.t1 === seg.t0)
    return { x: seg.x1, walking: false, dir, dist: 0 };
  const p = prog(t, seg.t0, seg.t1 - seg.t0); // kecepatan tetap: kaki tidak meluncur
  return {
    x: seg.x0 + (seg.x1 - seg.x0) * p,
    walking: t >= seg.t0,
    dir,
    dist: Math.abs((seg.x1 - seg.x0) * p),
  };
}

const D2R = Math.PI / 180;
const rot = (a: number, p: [number, number]) =>
  `rotate(${a.toFixed(2)} ${p[0]} ${p[1]})`;
const g = (transform: string, inner: string) =>
  transform ? `<g transform="${transform}">${inner}</g>` : `<g>${inner}</g>`;

// Benda utama adegan yang ditunjuk sekali: item visual pertama yang muncul
// (bukan lanjutan adegan sebelumnya).
function pointOnce(sc: Scene, lt: number) {
  const G = stageGeom(),
    objs = sc.objects || [],
    n = objs.length;
  for (let i = 0; i < n; i++) {
    const o = objs[i];
    if (
      !["prop", "icon", "counter", "bars", "badge"].includes(o.t) ||
      carriedFrom(sc.prev, o)
    )
      continue;
    const at = objAt(sc, o, i, n) + 0.3,
      dur = 2.2;
    const gg =
      lt >= at && lt < at + dur
        ? Math.sin(Math.min(1, (lt - at) / dur) * Math.PI) ** 0.5
        : 0;
    const p = posAt(sc, o, i, n, lt);
    return { x: G.mx(p.x), y: G.my(p.y), g: Math.min(1, gg * 1.4) };
  }
  return null;
}

/** Filter bayangan Nus (sinar putih tipis + bayangan bawah). */
export function characterDefs() {
  const h = H * (PT ? 0.19 : 0.36);
  return `<filter id="nusf" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="0" stdDeviation="1" flood-color="#fff" flood-opacity=".45" result="glow"/><feDropShadow in="glow" dx="0" dy="${fx((10 * Math.min(W, H)) / 1080)}" stdDeviation="${fx((7 * Math.min(W, H)) / 1080)}" flood-color="#000" flood-opacity=".4"/></filter><filter id="nusb" x="-20%" y="-300%" width="140%" height="700%"><feGaussianBlur stdDeviation="${fx((4 * Math.min(W, H)) / 1080)}"/></filter><filter id="emo" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="${fx(h * 0.2 * 0.08)}" stdDeviation="${fx(h * 0.2 * 0.1)}" flood-color="#000" flood-opacity=".4"/></filter>`;
}

export function character(sc: Scene, lt: number, t: number) {
  const R = loadRig(),
    S2 = R.side,
    gy = groundY();
  const scale = sc.nus?.s || 1;
  const h = H * (PT ? 0.19 : 0.36) * scale,
    w = (h * R.w) / R.h,
    k = h / R.h;
  const pos = nusPosition(t),
    walking = pos.walking && pos.dist > 0.5;
  const standX = pos.x,
    footY = gy + H * 0.022;

  let figure: string;
  if (walking) {
    // Tampak samping: siklus jalan, kaki sinkron dengan jarak tempuh.
    const ph = (pos.dist / (0.26 * h)) * Math.PI,
      P = S2.pivot,
      s = Math.sin(ph);
    const legAng = (sn: number) => 24 * sn,
      knee = (c: number) => 32 * Math.max(0, c);
    const limb = (
      up: string,
      lo: string,
      a: number,
      b: number,
      j1: string,
      j2: string,
    ) => g(rot(a, P[j1]), art[up] + g(rot(b, P[j2]), art[lo]));
    const body =
      limb("s_arm_far_up", "s_arm_far_lo", -20 * s, -22, "sh", "el") +
      limb(
        "s_leg_far_up",
        "s_leg_far_lo",
        legAng(s),
        knee(-Math.cos(ph)),
        "hip",
        "kn",
      ) +
      art.s_torso +
      limb(
        "s_leg_up",
        "s_leg_lo",
        -legAng(s),
        knee(Math.cos(ph)),
        "hip",
        "kn",
      ) +
      limb("s_arm_up", "s_arm_lo", 20 * s, -22, "sh", "el") +
      g(rot(0, P.head), art.s_head);
    figure = g(
      pos.dir < 0 ? `translate(${R.w} 0) scale(-1 1)` : "",
      g(
        `translate(0 ${(-Math.abs(s) * 0.9).toFixed(2)}) rotate(2.5 ${P.pelvis[0]} ${P.pelvis[1]})`,
        body,
      ),
    );
  } else {
    // Tampak depan: diam; hanya pose suasana statis dan satu gestur menunjuk.
    const P = R.pivot;
    const pose = {
      lean: 0,
      L: { sh: 5, el: 3 },
      R: { sh: -5, el: 3 },
      headRot: 0,
      y: 0,
    };
    const mood =
      sc.nus?.pose ||
      (
        {
          surprised: "surprised",
          thinking: "think",
          serious: "cross",
        } as Record<string, string>
      )[sc.mood] ||
      "idle";
    const settle = ease.inOut(prog(lt, 0.15, 0.6)); // masuk pose pelan
    if (mood === "surprised") {
      pose.L = { sh: 5 + 45 * settle, el: 3 + 20 * settle };
      pose.R = { sh: -5 - 45 * settle, el: 3 + 20 * settle };
      pose.lean = -2 * settle;
    } else if (mood === "think") {
      pose.R = { sh: -14 * settle - 5 * (1 - settle), el: 3 + 147 * settle };
      pose.headRot = 4 * settle;
    } else if (mood === "cross") {
      pose.L = { sh: 5 + 13 * settle, el: 3 + 106 * settle };
      pose.R = { sh: -5 - 13 * settle, el: 3 + 106 * settle };
    } else if (mood === "shrug") {
      pose.L = { sh: 5 + 29 * settle, el: 3 + 72 * settle };
      pose.R = { sh: -5 - 29 * settle, el: 3 + 72 * settle };
      pose.headRot = 5 * settle;
    } else if (mood === "cheer") {
      pose.L = { sh: 5 + 130 * settle, el: 8 };
      pose.R = { sh: -5 - 130 * settle, el: 8 };
    } else if (mood === "wave") {
      pose.R = { sh: -5 - 140 * settle, el: 10 };
    }
    // Satu gestur menunjuk per adegan (lengan di sisi benda), lalu turun pelan.
    if (sc.layout !== "outro") {
      const tg = pointOnce(sc, lt);
      if (tg && tg.g > 0.01) {
        const useR = tg.x >= standX,
          shoulder = {
            x: standX + k * ((useR ? P.shR[0] : P.shL[0]) - 22),
            y: footY - h + k * P.shR[1],
          };
        const phi = Math.atan2(-(tg.x - shoulder.x), tg.y - shoulder.y) / D2R,
          arm = useR ? pose.R : pose.L;
        arm.sh = arm.sh + (phi - arm.sh) * tg.g;
        arm.el = arm.el * (1 - tg.g);
      }
    }
    const leg = (s: "L" | "R") =>
      g(rot(0, P[`hip${s}`]), art[`leg${s}_up`] + g("", art[`leg${s}_lo`]));
    const armL = g(
      rot(pose.L.sh, P.shL),
      art.armL_up + g(rot(-pose.L.el, P.elL), art.armL_lo),
    );
    const armR = g(
      rot(pose.R.sh, P.shR),
      art.armR_up + g(rot(pose.R.el, P.elR), art.armR_lo),
    );
    figure = g(
      `translate(0 ${pose.y})`,
      leg("L") +
        leg("R") +
        g(
          rot(pose.lean, P.pelvis),
          g("", art.torso) +
            g("", art.patch) +
            armL +
            armR +
            g(rot(pose.headRot, P.head), art.head),
        ),
    );
  }

  // Posisi + ikon suasana (muncul sebentar, diam, lalu memudar).
  const left = standX - w / 2,
    top = footY - h;
  const em = EMOTE[sc.mood] || EMOTE.happy,
    ep = ease.back(prog(lt, 0.4, 0.5)),
    size = h * 0.2;
  const eOpacity = walking ? 0 : cl(ep * 3) * (1 - prog(lt, 2.6, 0.5));
  const ex = w * 0.5 + (standX < W / 2 ? 1 : -1) * w * 0.3,
    eScale = 0.4 + 0.6 * ep;
  const emote =
    eOpacity > 0.001
      ? `<g opacity="${eOpacity.toFixed(3)}" transform="translate(${fx(ex)},0) scale(${eScale.toFixed(3)})"><circle r="${fx(size / 2)}" fill="#F4EFE6" filter="url(#emo)"/><text text-anchor="middle" dominant-baseline="central" font-size="${fx(size * 0.62)}" font-weight="800" fill="${em[1]}">${esc(em[0])}</text></g>`
      : "";
  const shadow = `<ellipse cx="${fx(w / 2)}" cy="${fx(h * 0.9975)}" rx="${fx(w * 0.44)}" ry="${fx(h * 0.0175)}" fill="#000" fill-opacity=".4" filter="url(#nusb)"/>`;
  return `<g filter="url(#nusf)" transform="translate(${fx(left)},${fx(top)})">${shadow}<g transform="scale(${(w / R.w).toFixed(4)},${(h / R.h).toFixed(4)})">${figure}</g>${emote}</g>`;
}
