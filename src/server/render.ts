import sharp, { type OverlayOptions } from "sharp";
import opentype from "opentype.js";
import { templates, overlayPath } from "./templates";
// Port render_panels_5panel.py (skill-ncpost-buku): stok cover-crop ke
// jendela template, overlay progress-accent di atasnya, lalu teks.
const regular = opentype.loadSync(
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  ),
  bold = opentype.loadSync(
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  );
const CANVAS = { width: 1080, height: 1350 };
const COVER_ZOOM = 1.28;
const OVERFLOW_MARGIN = 20;
const COLORS = { heading: "#1C1C1C", body: "#303030", footer: "#1C1C1C" };
type Template = (typeof templates)[number];
function wrap(text: string, font: opentype.Font, size: number, width: number) {
  const out: string[] = [];
  let line = "";
  for (const word of text.replace(/[*_`]/g, "").split(/\s+/).filter(Boolean)) {
    if (font.getAdvanceWidth(word, size) > width)
      throw Error("Overflow: kata terlalu panjang");
    const next = line ? line + " " + word : word;
    if (font.getAdvanceWidth(next, size) > width) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}
// Tinggi teks heading (+gap) + paragraf harus muat sebelum footer.
export function fits(t: Template, heading: string, body: string) {
  try {
    const h = heading ? wrap(heading, bold, t.hs, t.width) : [],
      b = wrap(body, regular, t.bs, t.width);
    const used = h.length * t.hl + (h.length ? t.gap : 0) + b.length * t.bl;
    return used <= t.footer - t.y - OVERFLOW_MARGIN;
  } catch {
    return false;
  }
}
// Acak urutan template lalu ambil yang pertama muat; vertikal (4/4B) hanya
// bila panel ini punya stok portrait, horizontal hanya bila buku punya sumber
// horizontal.
export function pickTemplate(
  heading: string,
  body: string,
  allowVertical: boolean,
  allowHorizontal = true,
  random = Math.random,
) {
  const order = templates.filter((t) =>
    t.vertical ? allowVertical : allowHorizontal,
  );
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const t = order.find((t) => fits(t, heading, body));
  if (!t) throw Error("Overflow: teks tidak muat di template mana pun");
  return t;
}
function textPath(
  font: opentype.Font,
  text: string,
  x: number,
  top: number,
  size: number,
  color: string,
) {
  const baseline = top + (font.ascender / font.unitsPerEm) * size;
  const path = font.getPath(text, x, baseline, size);
  path.fill = color;
  return path.toSVG(2);
}
// Footer bold 20px, mengecil sampai 12px lalu dipotong dengan elipsis.
function footerPath(t: Template, footer: string) {
  let size = 20;
  while (size > 12 && bold.getAdvanceWidth(footer, size) > t.width) size--;
  let text = footer;
  while (bold.getAdvanceWidth(text + "…", size) > t.width && text.length > 1)
    text = text.slice(0, -1).trimEnd();
  if (text !== footer) text += "…";
  return textPath(bold, text, t.left, t.footer, size, COLORS.footer);
}
async function coverCrop(
  file: string,
  width: number,
  height: number,
  zoom = COVER_ZOOM,
) {
  const meta = await sharp(file).metadata();
  const scale = Math.max(width / meta.width!, height / meta.height!) * zoom;
  const w = Math.round(meta.width! * scale),
    h = Math.round(meta.height! * scale);
  return sharp(file)
    .resize(w, h, { kernel: "lanczos3" })
    .extract({
      left: Math.floor((w - width) / 2),
      top: Math.floor((h - height) / 2),
      width,
      height,
    })
    .png()
    .toBuffer();
}
export async function renderPanel(
  id: string,
  panel: number,
  heading: string,
  body: string,
  footer: string,
  stock?: string,
) {
  const t = templates.find((t) => t.id === id);
  if (!t) throw Error("Template ditolak");
  if (t.vertical && !stock)
    throw Error("Template vertikal membutuhkan stok portrait asli");
  if (!fits(t, heading, body))
    throw Error("Overflow: teks tidak muat pada template");
  const h = heading ? wrap(heading, bold, t.hs, t.width) : [],
    b = wrap(body, regular, t.bs, t.width);
  let y = t.y;
  let paths = "";
  for (const line of h) {
    paths += textPath(bold, line, t.left, y, t.hs, COLORS.heading);
    y += t.hl;
  }
  if (h.length) y += t.gap;
  for (const line of b) {
    paths += textPath(regular, line, t.left, y, t.bs, COLORS.body);
    y += t.bl;
  }
  paths += footerPath(t, footer);
  const [x1, y1, x2, y2] = t.window;
  const text = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}">${paths}</svg>`,
  );
  const layers: OverlayOptions[] = [];
  if (stock)
    layers.push({
      input: await coverCrop(stock, x2 - x1, y2 - y1),
      left: x1,
      top: y1,
    });
  else
    layers.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}"><rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="#ecebe8"/><text x="${x1 + 25}" y="${y1 + 55}" font-size="25" fill="#666">PREVIEW TEMPLATE • STOK BELUM ADA</text></svg>`,
      ),
    });
  layers.push({ input: overlayPath(id, panel) }, { input: text });
  return sharp({
    create: { ...CANVAS, channels: 4, background: "#FFFFFF" },
  })
    .composite(layers)
    .flatten({ background: "#FFFFFF" })
    .png()
    .toBuffer();
}
// Video per kalimat (Claude Design): gambar penuh tanpa zoom; slide biasa =
// template D (bayangan gelap di bawah + kartu subtitle gelap dengan garis
// gradien, kalimat karaoke tebal rata tengah); slide pertama = template E2
// (gambar digelapkan, heading hook besar di tengah atas + label
// "BUKU · BAGIAN N"). Ukuran per orientasi: horizontal 1920×1080, vertikal
// 1080×1920 (kartu dan heading 380px dari tepi agar aman dari UI Reels).
export interface SubtitleSpec {
  width: number;
  height: number;
  scrim: { height: number; opacity: number };
  card: {
    width: number;
    bottom: number; // tepi bawah kartu (y)
    padX: number;
    text: { max: number; min: number; lines: number };
  };
  opening: {
    top: number;
    width: number;
    gap: number;
    label: number;
    heading: { max: number; min: number; lines: number };
  };
}
export const SUBTITLE_LANDSCAPE: SubtitleSpec = {
  width: 1920,
  height: 1080,
  scrim: { height: 420, opacity: 0.35 },
  card: {
    width: 1440,
    bottom: 992,
    padX: 56,
    text: { max: 50, min: 34, lines: 4 },
  },
  opening: {
    top: 190,
    width: 1440,
    gap: 30,
    label: 24,
    heading: { max: 84, min: 44, lines: 3 },
  },
};
export const SUBTITLE_VERTICAL: SubtitleSpec = {
  width: 1080,
  height: 1920,
  scrim: { height: 900, opacity: 0.45 },
  card: {
    width: 920,
    bottom: 1540,
    padX: 48,
    text: { max: 52, min: 32, lines: 6 },
  },
  opening: {
    top: 380,
    width: 920,
    gap: 34,
    label: 26,
    heading: { max: 92, min: 48, lines: 4 },
  },
};
const CARD = { padTop: 34, bar: 8, gap: 22, padBottom: 38 };
const OPENING_BAR = 10;
const LABEL_TRACKING = 3;
export function subtitleLayout(
  sentence: string,
  spec: SubtitleSpec = SUBTITLE_LANDSCAPE,
) {
  const { card } = spec;
  const width = card.width - card.padX * 2;
  for (let size = card.text.max; size >= card.text.min; size--) {
    const lineHeight = Math.round(size * 1.36);
    let lines: string[];
    try {
      lines = wrap(sentence, bold, size, width);
    } catch {
      continue;
    }
    if (lines.length > card.text.lines) continue;
    const cardHeight =
      CARD.padTop +
      CARD.bar +
      CARD.gap +
      lines.length * lineHeight +
      CARD.padBottom;
    const cardTop = card.bottom - cardHeight;
    return {
      x: spec.width / 2,
      y: cardTop + CARD.padTop + CARD.bar + CARD.gap,
      size,
      lineHeight,
      lines,
      ascender: bold.ascender / bold.unitsPerEm,
      descender: bold.descender / bold.unitsPerEm,
      cardTop,
      cardHeight,
    };
  }
  throw Error("Overflow: kalimat terlalu panjang untuk subtitle video");
}
export interface SubtitleOpening {
  heading: string;
  label: string;
}
// Teks rata tengah sebagai path; tracking = jarak tambahan antarhuruf (px).
function centeredPath(
  canvasWidth: number,
  font: opentype.Font,
  text: string,
  size: number,
  top: number,
  fill: string,
  tracking = 0,
) {
  const glyphWidth = (ch: string) => font.getAdvanceWidth(ch, size) + tracking;
  const width = tracking
    ? [...text].reduce((w, ch) => w + glyphWidth(ch), 0) - tracking
    : font.getAdvanceWidth(text, size);
  let x = (canvasWidth - width) / 2;
  const baseline = top + (font.ascender / font.unitsPerEm) * size;
  if (!tracking) {
    const path = font.getPath(text, x, baseline, size);
    path.fill = fill;
    return path.toSVG(2);
  }
  let out = "";
  for (const ch of text) {
    const path = font.getPath(ch, x, baseline, size);
    path.fill = fill;
    out += path.toSVG(2);
    x += glyphWidth(ch);
  }
  return out;
}
// Heading mengecil dari ukuran maksimal sampai muat dalam batas baris.
export function openingLayout(
  heading: string,
  spec: SubtitleSpec = SUBTITLE_LANDSCAPE,
) {
  const h = spec.opening.heading;
  for (let size = h.max; size >= h.min; size--) {
    let lines: string[];
    try {
      lines = wrap(heading, bold, size, spec.opening.width);
    } catch {
      continue;
    }
    if (lines.length <= h.lines)
      return { size, lineHeight: Math.round(size * 1.16), lines };
  }
  throw Error("Overflow: heading hook terlalu panjang untuk slide pembuka");
}
function openingSvg(opening: SubtitleOpening, spec: SubtitleSpec) {
  const h = openingLayout(opening.heading, spec);
  const o = spec.opening;
  let y = o.top;
  let out = `<rect x="0" y="0" width="${spec.width}" height="${spec.height}" fill="rgb(10,10,14)" fill-opacity="0.42"/>`;
  out += `<rect x="${spec.width / 2 - 80}" y="${y}" width="160" height="${OPENING_BAR}" rx="5" fill="url(#bar)"/>`;
  y += OPENING_BAR + o.gap;
  let heading = "";
  for (const line of h.lines) {
    heading += centeredPath(spec.width, bold, line, h.size, y, "#FFFFFF");
    y += h.lineHeight;
  }
  out += `<g filter="url(#textShadow)">${heading}</g>`;
  y += o.gap;
  out += centeredPath(
    spec.width,
    bold,
    opening.label.toUpperCase(),
    o.label,
    y,
    "rgba(255,255,255,0.8)",
    LABEL_TRACKING,
  );
  return out;
}
export async function renderSubtitleFrame(
  stock: string,
  layout: { cardTop: number; cardHeight: number },
  opening?: SubtitleOpening,
  spec: SubtitleSpec = SUBTITLE_LANDSCAPE,
) {
  const { width, height, card, scrim } = spec;
  const cardX = (width - card.width) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<defs>
<linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${scrim.opacity}"/></linearGradient>
<linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1E88C8"/><stop offset="1" stop-color="#8F30E8"/></linearGradient>
<filter id="shadow" x="-10%" y="-30%" width="120%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#000" flood-opacity="0.35"/></filter>
<filter id="textShadow" x="-5%" y="-20%" width="110%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="9" flood-color="#000" flood-opacity="0.55"/></filter>
</defs>
${opening ? openingSvg(opening, spec) : `<rect x="0" y="${height - scrim.height}" width="${width}" height="${scrim.height}" fill="url(#scrim)"/>`}
<rect x="${cardX}" y="${layout.cardTop}" width="${card.width}" height="${layout.cardHeight}" rx="28" fill="rgb(18,18,22)" fill-opacity="0.72" filter="url(#shadow)"/>
<rect x="${width / 2 - 60}" y="${layout.cardTop + CARD.padTop}" width="120" height="${CARD.bar}" rx="4" fill="url(#bar)"/>
</svg>`;
  return sharp({
    create: { width, height, channels: 4, background: "#1C1C1C" },
  })
    .composite([
      { input: await coverCrop(stock, width, height, 1) },
      { input: Buffer.from(svg) },
    ])
    .flatten({ background: "#1C1C1C" })
    .png()
    .toBuffer();
}
