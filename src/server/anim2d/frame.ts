// Perakit frame Video Animasi 2D: renderFrame(t) menghasilkan satu SVG utuh
// untuk detik t (port core.js Nus 2D Studio tanpa browser). Bagian yang di
// Nus 2D Studio berupa HTML (judul, caption, penutup, watermark, HUD) di sini
// digambar langsung sebagai SVG dengan tata letak yang sama.
import { character, characterDefs, nusTrackInit } from "./character";
import { iconMarkup } from "./icons";
import { resolveScenes } from "./layout";
import { stage, stageDefs, stageGeom } from "./stage";
import {
  H,
  PAL,
  PT,
  S,
  V,
  W,
  cl,
  ease,
  fx,
  lerp,
  norm,
  pop,
  prog,
  u,
  useVideo,
  type Scene,
  type Video,
} from "./state";
import {
  ASCENT,
  DESCENT,
  NORMAL_LINE,
  textShape,
  textToPaths,
  type Weight,
} from "./text";
import { background, groundY, world } from "./world";

/** Baseline baris teks CSS setinggi lineHeight (dalam em) dari atas baris. */
const baseline = (size: number, lineHeight: number) =>
  ((lineHeight - (ASCENT - DESCENT)) / 2 + ASCENT) * size;
const glyphs = (
  text: string,
  size: number,
  weight: Weight,
  fill: string,
  x: number,
  y: number,
  spacing = 0,
  extra = "",
) =>
  `<path transform="translate(${fx(x)},${fx(y)})" d="${textShape(text, size, weight, spacing).d}" fill="${fill}"${extra}/>`;

// ---------- judul: kata per kata muncul; *kata* berwarna aksen ----------
type Word = { text: string; width: number; accent: boolean };
function titleWords(text: string, size: number) {
  let on = false;
  return text.split(" ").map((raw): Word => {
    let w = raw;
    if (w.startsWith("*")) {
      on = true;
      w = w.slice(1);
    }
    const close = w.endsWith("*");
    if (close) w = w.slice(0, -1);
    const accent = on;
    if (close) on = false;
    w = w.replace(/\*/g, "");
    return { text: w, width: textShape(w, size, 800, -0.01).width, accent };
  });
}
// flex-wrap rata tengah: baris dipecah selebar maxWidth.
function flexLines(words: Word[], gapX: number, maxWidth: number) {
  const lines: { words: Word[]; width: number }[] = [];
  for (const w of words) {
    const line = lines.at(-1);
    if (line && line.width + gapX + w.width <= maxWidth) {
      line.words.push(w);
      line.width += gapX + w.width;
    } else lines.push({ words: [w], width: w.width });
  }
  return lines;
}
function titleBlock(text: string, size: number, maxWidth: number) {
  const px = u(size),
    gapX = u(size * 0.26),
    gapY = u(size * 0.1),
    lh = 1.08 * px;
  const lines = flexLines(titleWords(text, px), gapX, maxWidth);
  const width = Math.max(0, ...lines.map((l) => l.width));
  return {
    px,
    gapX,
    gapY,
    lh,
    lines,
    width,
    height: lines.length * lh + Math.max(0, lines.length - 1) * gapY,
  };
}
/** Judul berpusat di cx, sisi atas di top. */
function titleSVG(
  block: ReturnType<typeof titleBlock>,
  cx: number,
  top: number,
  lt: number,
  accent: string,
  start = 0.12,
) {
  let out = "",
    i = 0;
  block.lines.forEach((line, li) => {
    let x = cx - line.width / 2;
    const y = top + li * (block.lh + block.gapY);
    for (const w of line.words) {
      const p = pop(lt, start + i++ * 0.09);
      if (p.opacity > 0.001) {
        const mx = x + w.width / 2,
          my = y + block.lh / 2;
        out += `<g opacity="${p.opacity.toFixed(3)}" transform="translate(${fx(mx)},${fx(my + p.dy)}) scale(${p.scale.toFixed(3)}) translate(${fx(-mx)},${fx(-my)})">${glyphs(w.text, block.px, 800, w.accent ? accent : PAL.fg, x, y + baseline(block.px, 1.08), -0.01)}</g>`;
      }
      x += w.width + block.gapX;
    }
  });
  return out ? `<g filter="url(#tsh)">${out}</g>` : "";
}

// ---------- caption: satu frasa, kata kunci kuning bergaris bawah ----------
function caption(sc: Scene, lt: number) {
  const ch = sc.chunks.find((c) => lt >= c.s && lt < c.e);
  if (!ch) return "";
  const hl = (sc.hl || [])
    .flatMap((h) => String(h).split(/\s+/))
    .map(norm)
    .filter(Boolean);
  const size = u(PT ? 54 : 48),
    lh = 1.28 * size,
    space = textShape(" ", size, 600).width,
    maxWidth = W * 0.86;
  const words = ch.words.map((w) => ({
    ...w,
    width: textShape(w.w, size, 600).width,
  }));
  const lines: { words: typeof words; width: number }[] = [];
  for (const w of words) {
    const line = lines.at(-1);
    if (line && line.width + space + w.width <= maxWidth) {
      line.words.push(w);
      line.width += space + w.width;
    } else lines.push({ words: [w], width: w.width });
  }
  const p = prog(lt, ch.s, 0.14);
  const top = (PT ? H * 0.775 : H * 0.865) + (1 - p) * 10 * S;
  let out = "";
  lines.forEach((line, li) => {
    let x = W / 2 - line.width / 2;
    const y = top + li * lh + baseline(size, 1.28);
    for (const w of line.words) {
      const spoken = lt >= w.s - 0.03;
      const key = /\d/.test(w.w) || hl.includes(norm(w.w));
      const color = key ? PAL.c[0] : PAL.fg;
      const line = key
        ? `<rect x="${fx(x)}" y="${fx(y + u(9) - u(2))}" width="${fx(w.width)}" height="${fx(u(4))}" fill="${color}"/>`
        : "";
      out += `<g opacity="${spoken ? 1 : 0.4}">${glyphs(w.w, size, 600, color, x, y)}${line}</g>`;
      x += w.width + space;
    }
  });
  return `<g opacity="${p.toFixed(3)}" filter="url(#csh)">${out}</g>`;
}

function watermark() {
  if (!V.brand) return "";
  const size = u(26),
    width = textShape(V.brand, size, 600, 0.02).width;
  return glyphs(
    V.brand,
    size,
    600,
    "#fff",
    W / 2 - width / 2,
    H * 0.03 + baseline(size, NORMAL_LINE),
    0.02,
    ' fill-opacity=".72"',
  );
}

function icon(name: string, size: number, color: string, sw = 2.2) {
  return `<g transform="scale(${(size / 24).toFixed(4)})" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${iconMarkup(name)}</g>`;
}

// ---------- layar penutup: ikon, judul, ajakan ----------
function outro(sc: Scene, lt: number, ci: number) {
  const col = PAL.c[ci % 3],
    zone = PT ? 0.075 : 0.085;
  const top = H * zone,
    height = groundY() - H * zone - H * (PT ? 0.2 : 0.02),
    gap = u(PT ? 40 : 28);
  const bubbleSize = u(PT ? 300 : 240),
    margin = Math.sin(lt * 2.4) * 8 * S;
  const title = titleBlock(sc.title, PT ? 100 : 84, W * 0.88);
  const ctaSize = u(PT ? 50 : 42),
    ctaText = sc.cta || "",
    ctaW = textShape(ctaText, ctaSize, 800).width + 2 * u(44),
    ctaH = NORMAL_LINE * ctaSize + 2 * u(18);
  const total = bubbleSize + margin + gap + title.height + gap + ctaH;
  let y = top + (height - total) / 2 + margin;
  const cx = W / 2;

  const b = pop(lt, 0.05),
    by = y + bubbleSize / 2;
  const iconSize = u(PT ? 160 : 130);
  const bubble = `<g opacity="${b.opacity.toFixed(3)}" transform="translate(${fx(cx)},${fx(by + b.dy)}) scale(${b.scale.toFixed(3)})"><circle r="${fx(bubbleSize / 2)}" fill="${col}" filter="url(#osh)"/><g transform="translate(${fx(-iconSize / 2)},${fx(-iconSize / 2)})">${icon(sc.icon || "message-circle", iconSize, PAL.dark)}</g></g>`;
  y += bubbleSize + gap;
  const heading = titleSVG(title, cx, y, lt, col, 0.25);
  y += title.height + gap;
  const c = pop(lt, 1.0),
    cy = y + ctaH / 2;
  const cta = ctaText
    ? `<g opacity="${c.opacity.toFixed(3)}" transform="translate(${fx(cx)},${fx(cy + c.dy)}) scale(${c.scale.toFixed(3)})"><rect x="${fx(-ctaW / 2)}" y="${fx(-ctaH / 2)}" width="${fx(ctaW)}" height="${fx(ctaH)}" rx="${fx(Math.min(u(60), ctaH / 2))}" fill="${col}" filter="url(#psh)"/>${glyphs(ctaText, ctaSize, 800, PAL.dark, -ctaW / 2 + u(44), -ctaH / 2 + u(18) + baseline(ctaSize, NORMAL_LINE))}</g>`
    : "";
  return bubble + heading + cta;
}

// Kamera: zoom/pan halus antar adegan menuju titik fokus; latar, objek, dan
// tanah ikut bergerak, Nus dan caption tidak.
function cameraMatrix(idx: number, t: number) {
  const G = stageGeom(),
    sc = V.scenes[idx],
    lt = t - sc.start;
  const f = (s: Scene) => {
    const fo = s.focus || ({} as Partial<NonNullable<Scene["focus"]>>);
    return { x: G.mx(fo.x ?? 500), y: G.my(fo.y ?? 500), z: fo.z || 1 };
  };
  let cur = f(sc);
  if (idx > 0) {
    const pv = f(V.scenes[idx - 1]),
      c = ease.inOut(prog(lt, 0, 1.0));
    cur = {
      x: lerp(pv.x, cur.x, c),
      y: lerp(pv.y, cur.y, c),
      z: lerp(pv.z, cur.z, c),
    };
  }
  const z = cur.z,
    cx = G.mx(500);
  // Zoom berjangkar di garis tanah: tanah, Nus, dan caption tidak bergeser.
  const tx = cl(cx - z * cur.x, W - z * W, 0),
    ty = (1 - z) * groundY();
  return `matrix(${z.toFixed(4)} 0 0 ${z.toFixed(4)} ${tx.toFixed(1)} ${ty.toFixed(1)})`;
}

function defs() {
  // Vignette: radial-gradient(ellipse at 50% 42%, transparent 45%, rgba(0,0,0,.5) 100%).
  const rx = W * 0.5 * Math.SQRT2,
    ry = H * 0.58 * Math.SQRT2;
  return `<defs><radialGradient id="vig" gradientUnits="userSpaceOnUse" cx="${fx(W / 2)}" cy="${fx(H * 0.42)}" r="${fx(rx)}" gradientTransform="translate(${fx(W / 2)},${fx(H * 0.42)}) scale(1,${(ry / rx).toFixed(4)}) translate(${fx(-W / 2)},${fx(-H * 0.42)})"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient>${stageDefs()}${characterDefs()}<filter id="tsh" x="-20%" y="-50%" width="140%" height="200%"><feDropShadow dx="0" dy="${fx(u(4))}" stdDeviation="${fx(u(9))}" flood-color="#000" flood-opacity=".55"/></filter><filter id="csh" x="-10%" y="-50%" width="120%" height="200%"><feDropShadow dx="0" dy="${fx(u(3))}" stdDeviation="${fx(u(8))}" flood-color="#000" flood-opacity=".7"/></filter><filter id="osh" x="-40%" y="-40%" width="180%" height="190%"><feDropShadow dx="0" dy="${fx(u(14))}" stdDeviation="${fx(u(18))}" flood-color="#000" flood-opacity=".45"/></filter><filter id="psh" x="-20%" y="-60%" width="140%" height="240%"><feDropShadow dx="0" dy="${fx(u(10))}" stdDeviation="${fx(u(14))}" flood-color="#000" flood-opacity=".4"/></filter></defs>`;
}

// opacity pada bentuk tunggal dipindah ke fill-/stroke-opacity (tampilannya
// sama). resvg membuat lapisan untuk setiap opacity dan panic (proses mati)
// bila lapisan itu jauh di luar kanvas, mis. salinan siluet latar yang
// bergulir saat kamera zoom.
function leafOpacity(svg: string) {
  return svg.replace(
    /<(rect|circle|ellipse|polygon|polyline|path|line)\b([^>]*?)\/>/g,
    (whole, tag: string, attrs: string) => {
      const op = / opacity="([^"]*)"/.exec(attrs);
      if (!op) return whole;
      const alpha = Number(op[1]);
      let rest = attrs.replace(op[0], "");
      const multiply = (name: string) => {
        const found = new RegExp(` ${name}="([^"]*)"`).exec(rest);
        rest = found
          ? rest.replace(
              found[0],
              ` ${name}="${(Number(found[1]) * alpha).toFixed(3)}"`,
            )
          : `${rest} ${name}="${alpha}"`;
      };
      multiply("fill-opacity");
      if (/ stroke="(?!none)/.test(rest)) multiply("stroke-opacity");
      return `<${tag}${rest}/>`;
    },
  );
}

/** Siapkan video: objek tiap adegan, fokus kamera, dan lintasan Nus. */
export function setVideo(v: Video) {
  useVideo(v);
  v.scenes.forEach((sc, i) => {
    sc.prev = i > 0 ? v.scenes[i - 1] : null;
  });
  resolveScenes();
  nusTrackInit();
}

/** Satu frame utuh (SVG) pada detik t. */
export function renderFrame(t: number) {
  let idx = V.scenes.findIndex((s) => t >= s.start && t < s.end);
  if (idx < 0) idx = V.scenes.length - 1;
  const sc = V.scenes[idx],
    lt = t - sc.start;
  const G = stageGeom();
  const isOutro = sc.layout === "outro";
  const scene = stage(isOutro ? { ...sc, objects: [] } : sc, lt, idx);
  const title =
    sc.title && !isOutro
      ? titleSVG(
          titleBlock(sc.title, PT ? 80 : 64, W * 0.88),
          W / 2,
          G.top,
          lt,
          PAL.c[idx % 3],
          0.1,
        )
      : "";
  const fadeIn = 1 - prog(t, 0, 0.35),
    fadeOut = prog(t, V.total - 0.5, 0.5),
    fade = Math.max(fadeIn, fadeOut);
  const hud =
    `<rect x="0" y="0" width="${fx((t / V.total) * W)}" height="${fx(u(8))}" fill="${PAL.c[0]}" opacity=".9"/>` +
    (fade > 0.01
      ? `<rect width="${W}" height="${H}" fill="#0A0F1A" opacity="${fade.toFixed(2)}"/>`
      : "");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs()}` +
    `<g transform="${cameraMatrix(idx, t)}">${background(t)}${world(idx, t)}${scene}${title}${isOutro ? outro(sc, lt, idx) : ""}</g>` +
    character(sc, lt, t) +
    `<rect width="${W}" height="${H}" fill="url(#vig)"/>${caption(sc, lt)}${watermark()}${hud}</svg>`;
  return leafOpacity(textToPaths(svg));
}
