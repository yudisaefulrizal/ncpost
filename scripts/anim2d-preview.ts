// Pratinjau mesin Video Animasi 2D tanpa Codex/TTS:
// npx tsx scripts/anim2d-preview.ts <naskah.json> <folder> <portrait|landscape> <lebar> [t1,t2,...]
// Timing kata dibuat merata, hanya untuk memeriksa tampilan.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { sanitizeScript } from "../src/server/anim2d/script";
import { setVideo, renderFrame } from "../src/server/anim2d/frame";
import { evenTimeline } from "../src/server/anim2d/timeline";

const [file, out, format = "portrait", width = "720", times] = process.argv.slice(2);
const script = sanitizeScript(JSON.parse(readFileSync(file, "utf8")), "demo");
const W = Number(width),
  H = Math.round(format === "portrait" ? (W * 16) / 9 : (W * 9) / 16);
const video = { W, H, brand: "nus", world: script.world, ...evenTimeline(script) };
setVideo(video);
mkdirSync(out, { recursive: true });
const shots = times
  ? times.split(",").map(Number)
  : video.scenes.map((sc) => sc.start + sc.dur - 0.7);
for (const t of shots) {
  const started = performance.now();
  const svg = renderFrame(t);
  const png = new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
  writeFileSync(path.join(out, `${format}_t${t.toFixed(1)}.png`), png);
  console.log(t.toFixed(1), Math.round(performance.now() - started) + "ms");
}
console.log("total", video.total.toFixed(1), "starts", video.scenes.map((s) => s.start.toFixed(1)).join(","));
