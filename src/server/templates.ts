import path from "node:path";
import { realpathSync } from "node:fs";
export const SOURCE = process.cwd();
export const TEMPLATE_ROOT = path.join(SOURCE, "asset/templates");
export const CTA_ROOT = path.join(SOURCE, "asset/closing-slide");
export const templates = [
  {
    id: "1",
    name: "Default",
    dir: "progress-accent",
    window: [90, 92, 990, 598],
    left: 130,
    width: 820,
    y: 734,
    hs: 54,
    hl: 64,
    gap: 24,
    bs: 35,
    bl: 46,
    footer: 1205,
    vertical: false,
  },
  {
    id: "2",
    name: "Gambar Bawah",
    dir: "variants/progress-accent/template-2-image-bottom",
    window: [90, 746, 990, 1252],
    left: 130,
    width: 820,
    y: 184,
    hs: 54,
    hl: 64,
    gap: 24,
    bs: 35,
    bl: 46,
    footer: 655,
    vertical: false,
  },
  {
    id: "4",
    name: "Vertikal Kiri",
    dir: "variants/progress-accent/template-4-equalarea-vertical-left",
    window: [630, 60, 1020, 1290],
    left: 94,
    width: 482,
    y: 246,
    hs: 44,
    hl: 54,
    gap: 20,
    bs: 30,
    bl: 40,
    footer: 1149,
    vertical: true,
  },
  {
    id: "4B",
    name: "Vertikal Kanan",
    dir: "variants/progress-accent/template-4B-equalarea-vertical-right",
    window: [60, 60, 450, 1290],
    left: 504,
    width: 482,
    y: 246,
    hs: 44,
    hl: 54,
    gap: 20,
    bs: 30,
    bl: 40,
    footer: 1149,
    vertical: true,
  },
  {
    id: "6",
    name: "Minimalist Flat Pastel Illustration",
    dir: "progress-accent/minimalist-flat-pastel-illustration",
    window: [50, 40, 1030, 1102],
    left: 100,
    width: 880,
    y: 1175,
    hs: 39,
    hl: 46,
    gap: 3,
    bs: 22,
    bl: 30,
    footer: 1280,
    vertical: false,
  },
];
export function safeFile(root: string, file: string) {
  const base = realpathSync(root),
    actual = realpathSync(file);
  if (!actual.startsWith(base + path.sep)) throw Error("Path aset ditolak");
  return actual;
}
export function overlayPath(id: string, panel: number) {
  const t = templates.find((t) => t.id === id);
  if (!t || !Number.isInteger(panel) || panel < 1 || panel > 6)
    throw Error("Template/panel tidak diizinkan");
  return safeFile(
    TEMPLATE_ROOT,
    path.join(
      TEMPLATE_ROOT,
      t.dir,
      `panel-overlay-${String(panel).padStart(2, "0")}-of-06.png`,
    ),
  );
}
