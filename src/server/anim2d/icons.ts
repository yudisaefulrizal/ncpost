// Ikon Lucide untuk Video Animasi 2D (kebab-case, viewBox 24×24, garis).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../config";

const ICON_DIR = path.join(ROOT, "node_modules/lucide-static/icons");
let names: string[] | undefined;
export function iconNames() {
  names ??= readdirSync(ICON_DIR)
    .filter((f) => f.endsWith(".svg"))
    .map((f) => f.slice(0, -4));
  return names;
}
const loaded = new Map<string, string>();
/** Isi <svg> ikon (tanpa pembungkus). */
export function iconMarkup(name: string) {
  let inner = loaded.get(name);
  if (inner === undefined) {
    const file = iconNames().includes(name) ? name : "sparkles";
    const svg = readFileSync(path.join(ICON_DIR, `${file}.svg`), "utf8");
    inner = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(svg)![1].trim();
    loaded.set(name, inner);
  }
  return inner;
}
/** Nama ikon dari naskah ke nama Lucide terdekat; null bila tidak dikenal. */
export function resolveIcon(name: unknown) {
  const all = iconNames();
  const n = String(name || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-");
  if (all.includes(n)) return n;
  const parts = n.split("-").filter(Boolean);
  return (
    all.find((x) => parts.length && parts.every((p) => x.includes(p))) ||
    all.find((x) => parts.some((p) => p.length > 3 && x.includes(p))) ||
    null
  );
}
