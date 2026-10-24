// Teks Video Animasi 2D digambar sebagai path (opentype.js) agar hasilnya
// sama di semua server tanpa font terpasang. Huruf Poppins (gaya Nus 2D
// Studio); glyph yang tidak ada di Poppins (★ ♪) memakai DejaVu.
import opentype from "opentype.js";
import path from "node:path";
import { ROOT } from "../config";

const POPPINS = path.join(ROOT, "node_modules/@fontsource/poppins/files");
const fonts = {
  600: opentype.loadSync(path.join(POPPINS, "poppins-latin-600-normal.woff")),
  800: opentype.loadSync(path.join(POPPINS, "poppins-latin-800-normal.woff")),
};
const fallback = opentype.loadSync(
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
);
export type Weight = 600 | 800;
const base = fonts[800];
// Metrik em (satuan 1 = ukuran huruf): ascender, descender (negatif),
// tinggi baris "normal".
export const ASCENT = base.ascender / base.unitsPerEm;
export const DESCENT = base.descender / base.unitsPerEm;
export const NORMAL_LINE =
  (base.ascender - base.descender + base.tables.hhea.lineGap) / base.unitsPerEm;

const cache = new Map<string, { d: string; width: number }>();
/** Path teks satu baris dengan baseline di y=0, mulai x=0. */
export function textShape(
  text: string,
  size: number,
  weight: Weight = 800,
  spacing = 0,
) {
  const key = `${weight}|${size.toFixed(2)}|${spacing}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const font = fonts[weight];
  let x = 0,
    d = "",
    prev: opentype.Glyph | null = null;
  for (const ch of text) {
    let f = font,
      glyph = font.charToGlyph(ch);
    if (!glyph.index && ch.trim()) {
      f = fallback;
      glyph = fallback.charToGlyph(ch);
    }
    if (prev && f === font)
      x += (font.getKerningValue(prev, glyph) / font.unitsPerEm) * size;
    d += glyph.getPath(x, 0, size).toPathData(2);
    x += ((glyph.advanceWidth || 0) / f.unitsPerEm) * size + spacing * size;
    prev = f === font ? glyph : null;
  }
  const shape = { d, width: text ? x - spacing * size : 0 };
  if (cache.size > 20000) cache.clear();
  cache.set(key, shape);
  return shape;
}
export const textWidth = (
  text: string,
  size: number,
  weight: Weight = 800,
  spacing = 0,
) => textShape(text, size, weight, spacing).width;

const attr = (attrs: string, name: string) =>
  new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1];
const unescape = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
/** Ganti setiap <text> di markup SVG dengan <path> yang setara. */
export function textToPaths(svg: string) {
  return svg.replace(
    /<text([^>]*)>([^<]*)<\/text>/g,
    (_, attrs: string, raw: string) => {
      const text = unescape(raw);
      if (!text.trim()) return "";
      const size = Number(attr(attrs, "font-size") || 16);
      const weight: Weight =
        Number(attr(attrs, "font-weight")) >= 700 ? 800 : 600;
      const ls = attr(attrs, "letter-spacing") || "";
      const spacing = ls.endsWith("em") ? parseFloat(ls) : 0;
      const shape = textShape(text, size, weight, spacing);
      const anchor = attr(attrs, "text-anchor");
      let x = Number(attr(attrs, "x") || 0),
        y = Number(attr(attrs, "y") || 0);
      if (anchor === "middle") x -= shape.width / 2;
      else if (anchor === "end") x -= shape.width;
      // central = tengah antara ascender dan descender
      if (attr(attrs, "dominant-baseline") === "central")
        y += ((ASCENT + DESCENT) / 2) * size;
      const keep = ["fill", "opacity", "fill-opacity"]
        .map((name) => {
          const v = attr(attrs, name);
          return v === undefined ? "" : ` ${name}="${v}"`;
        })
        .join("");
      const out = `<g transform="translate(${x.toFixed(2)},${y.toFixed(2)})"><path d="${shape.d}"${keep}/></g>`;
      const transform = attr(attrs, "transform");
      return transform ? `<g transform="${transform}">${out}</g>` : out;
    },
  );
}
