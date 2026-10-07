// Pipeline video per kalimat (port render_tiktok_video.py + render_audio_visualizer.py
// dari Hermes), dirancang untuk server kecil
// (2 core, RAM terbatas) dan satu keluaran saja: versi upload.
//
// - Dirender langsung di ukuran upload, 24 fps, satu file (tanpa versi penuh).
// - Tiap slide di-encode sekali. Dissolve hanya meng-encode potongan
//   FADE_FRAMES frame di sambungan (dari sumber mentah), badan klip digabung
//   tanpa encode ulang (stream copy, setiap potongan diawali keyframe).
// - Audio digabung dalam satu proses audio terpisah, lalu digabung dengan
//   video. Audio dan overlay visualizer dihitung sekali per bagian (cache) dan
//   dipakai bersama oleh semua video yang memakai narasi yang sama.
// - Cek integritas dari metadata (tanpa decode).
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { CTA_ROOT } from "./templates";
// Jeda setelah narasi tiap kalimat: slide bertahan 0,6 dtk sebelum pindah.
export const SENTENCE_GAP = 0.6;
export const FPS = 24;
// Dissolve antarslide: 10 frame (≈ 0,42 dtk); bilangan bulat agar potongan
// transisi dan badan klip bertemu tepat di batas frame.
export const FADE_FRAMES = 10;
export const CLOSING_CTA_VIDEO = path.join(
  CTA_ROOT,
  "minimalist-line-art-cta/slide-penutup-cta.mp4",
);
const FONTS_DIR = "/usr/share/fonts/truetype/dejavu";
export function run(cmd: string, args: string[], input?: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: [input ? "pipe" : "ignore", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    let err = "";
    child.stdout!.on("data", (d) => out.push(d));
    child.stderr!.on("data", (d) => (err = (err + d).slice(-2000)));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(out))
        : reject(Error(`${cmd} gagal: ${err.trim()}`)),
    );
    if (input) child.stdin!.end(input);
  });
}
// Frame mentah ditulis bertahap ke stdin ffmpeg (tidak ditampung di memori).
async function pipeFrames(args: string[], frames: Iterable<Buffer>) {
  const child = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
  let err = "";
  child.stderr!.on("data", (d) => (err = (err + d).slice(-2000)));
  const done = new Promise<void>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(Error(`ffmpeg gagal: ${err.trim()}`)),
    );
  });
  done.catch(() => {});
  child.stdin!.on("error", () => {});
  for (const frame of frames) {
    if (!child.stdin!.write(frame))
      await Promise.race([
        new Promise<void>((resolve) => child.stdin!.once("drain", resolve)),
        done,
      ]);
  }
  child.stdin!.end();
  await done;
}
export async function duration(file: string) {
  const out = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  return Number(out.toString().trim());
}
interface StreamInfo {
  codec_type: string;
  nb_frames?: string;
  duration?: string;
}
async function streams(file: string): Promise<StreamInfo[]> {
  const out = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,nb_frames,duration",
    "-of",
    "json",
    file,
  ]);
  return JSON.parse(out.toString()).streams;
}
export interface BodyLayout {
  x: number;
  y: number;
  size: number;
  lineHeight: number;
  lines: string[];
  ascender: number;
  descender: number;
}
function stamp(s: number) {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`;
}
// Paragraf tampil utuh sejak frame pertama; satu-satunya animasi adalah
// highlight per kata (\kf) sinkron narasi, mulai saat paragraf dibacakan
// (offset = bagian judul pada narasi panel 1). Satu event per baris agar
// jarak baris sama dengan render statis; filler \kf di awal tiap baris
// menghabiskan waktu kata-kata sebelumnya tanpa menyorot teks. Teks tetap
// tampil (tersorot penuh) sampai holdUntil, yaitu akhir klip termasuk jeda.
// Gaya karaoke: subtitle template D (rata tengah, tebal, putih redup →
// putih). Koordinat ASS memakai ruang desain; libass menskalakannya ke ukuran
// video.
export interface KaraokeStyle {
  playResX: number;
  playResY: number;
  center: boolean;
  bold: boolean;
  primary: string; // warna kata yang sudah dibacakan (ASS &HAABBGGRR)
  secondary: string; // warna kata yang belum dibacakan
}
export const LANDSCAPE_KARAOKE: KaraokeStyle = {
  playResX: 1920,
  playResY: 1080,
  center: true,
  bold: true,
  primary: "&H00FFFFFF",
  // Putih 55% (alpha ASS 0x73 = 45% transparan).
  secondary: "&H73FFFFFF",
};
export const VERTICAL_KARAOKE: KaraokeStyle = {
  ...LANDSCAPE_KARAOKE,
  playResX: 1080,
  playResY: 1920,
};
export function karaokeAss(
  layout: BodyLayout,
  narrationDuration: number,
  narrationOffset: number,
  style: KaraokeStyle,
  holdUntil = 0,
) {
  const lines = layout.lines.map((l) => l.split(" ").filter(Boolean));
  const words = lines.flat().length;
  const available = Math.max(0.4, narrationDuration - narrationOffset);
  const csTotal = Math.max(words, Math.round(available * 100));
  const base = Math.floor(csTotal / Math.max(1, words)),
    extra = csTotal % Math.max(1, words);
  let elapsed = Math.max(0, Math.round(narrationOffset * 100));
  let k = 0;
  const end = stamp(Math.max(narrationOffset + available, holdUntil));
  // Ukuran font ASS = tinggi ascender+descender; dikonversi agar ukuran em
  // sama dengan render statis.
  const fontSize = +(
    layout.size *
    (layout.ascender - layout.descender)
  ).toFixed(2);
  const events = lines.map((line, i) => {
    let text = elapsed > 0 ? `{\\kf${elapsed}}` : "";
    text += line
      .map((word) => {
        const cs = base + (k++ < extra ? 1 : 0);
        elapsed += cs;
        return `{\\kf${cs}}${word}`;
      })
      .join(" ");
    return `Dialogue: 0,${stamp(0)},${end},Karaoke,,0,0,0,,{\\an${style.center ? 8 : 7}\\pos(${layout.x},${layout.y + i * layout.lineHeight})}${text}`;
  });
  return (
    `[Script Info]\nScriptType: v4.00+\nPlayResX: ${style.playResX}\nPlayResY: ${style.playResY}\nScaledBorderAndShadow: yes\n\n` +
    "[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour," +
    "Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment," +
    "MarginL,MarginR,MarginV,Encoding\n" +
    `Style: Karaoke,DejaVu Sans,${fontSize},${style.primary},${style.secondary},&H00FFFFFF,&H00FFFFFF,` +
    `${style.bold ? -1 : 0},0,0,0,100,100,0,0,1,0,0,${style.center ? 8 : 7},0,0,0,1\n\n` +
    "[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n" +
    events.join("\n") +
    "\n"
  );
}
// Ukuran keluaran = ukuran upload. Frame dan ASS dirancang di ruang desain
// (width/height desain) lalu diskalakan ke ukuran keluaran.
export interface VideoFormat {
  width: number;
  height: number;
  designWidth: number;
  designHeight: number;
  gapFrames: number; // jeda setelah narasi tiap klip
  karaoke: KaraokeStyle;
}
const gapFrames = (seconds: number) => Math.round(seconds * FPS);
export const VERTICAL: VideoFormat = {
  width: 720,
  height: 1280,
  designWidth: 1080,
  designHeight: 1920,
  gapFrames: gapFrames(SENTENCE_GAP),
  karaoke: VERTICAL_KARAOKE,
};
export const LANDSCAPE: VideoFormat = {
  width: 1280,
  height: 720,
  designWidth: 1920,
  designHeight: 1080,
  gapFrames: gapFrames(SENTENCE_GAP),
  karaoke: LANDSCAPE_KARAOKE,
};
// Panel 1 membacakan judul lalu jeda sebelum paragraf: perkiraan proporsional
// bagian judul pada durasi narasi, maksimal 40%.
export function narrationOffset(
  heading: string,
  paragraph: string,
  narrationDuration: number,
) {
  const h = heading.length,
    p = Math.max(1, paragraph.length);
  return Math.min(narrationDuration * 0.4, (narrationDuration * h) / (h + p));
}
// Rencana potongan. clipFrames = jumlah frame tiap klip (slide + CTA di akhir).
// Klip k mulai di starts[k]; klip berikutnya menimpa FADE_FRAMES frame
// terakhirnya. Badan klip = frame di luar dua area sambungan, transisi =
// area sambungan itu sendiri.
export interface Piece {
  kind: "body" | "trans";
  slide: number; // trans: klip asal (tujuan = slide + 1)
  from: number; // frame awal di dalam klip (trans: awal ekor klip asal)
  frames: number;
  start: number; // frame awal di timeline akhir
}
export function planTimeline(clipFrames: number[]) {
  const n = clipFrames.length;
  if (n < 2) throw Error("Video butuh minimal dua klip");
  const starts: number[] = [];
  let at = 0;
  for (const frames of clipFrames) {
    starts.push(at);
    at += frames - FADE_FRAMES;
  }
  const total = at + FADE_FRAMES;
  const pieces: Piece[] = [];
  for (let k = 0; k < n; k++) {
    const from = k === 0 ? 0 : FADE_FRAMES;
    const to = clipFrames[k] - (k === n - 1 ? 0 : FADE_FRAMES);
    if (to - from < 1)
      throw Error(`Klip ${k + 1} terlalu pendek untuk dissolve`);
    pieces.push({
      kind: "body",
      slide: k,
      from,
      frames: to - from,
      start: starts[k] + from,
    });
    if (k < n - 1)
      pieces.push({
        kind: "trans",
        slide: k,
        from: clipFrames[k] - FADE_FRAMES,
        frames: FADE_FRAMES,
        start: starts[k + 1],
      });
  }
  return { starts, total, pieces };
}
// Visualizer NC Post: 40 bar pil hitam alpha 0.2, tinggi 10–40px, area
// 288×90 di kanan atas (24px dari kanan, 19px dari atas), respons langsung.
// Dirancang di ruang 1080 lalu diskalakan ke ukuran keluaran.
const BANDS = 40,
  VIS_W = 288,
  VIS_H = 90,
  MIN_H = 10,
  MAX_H = 40,
  ALPHA = 51;
export function visualizerFrame(spectrum: Buffer) {
  const img = Buffer.alloc(VIS_W * VIS_H * 4);
  const padX = 5,
    gap = 3;
  const barW = Math.floor((VIS_W - 2 * padX - gap * (BANDS - 1)) / BANDS);
  const used = barW * BANDS + gap * (BANDS - 1);
  const startX = Math.floor((VIS_W - used) / 2);
  const r = Math.floor(barW / 2);
  // Frekuensi rendah di tengah.
  const sourceFor: number[] = Array(BANDS);
  const left = BANDS / 2 - 1,
    right = BANDS / 2;
  for (let band = 0; band < BANDS; band++) {
    const d = Math.floor(band / 2);
    sourceFor[band % 2 === 0 ? left - d : right + d] = band;
  }
  sourceFor.forEach((band, position) => {
    let top = VIS_H;
    for (let y = 0; y < VIS_H; y++) {
      const o = (y * BANDS + band) * 3;
      if (spectrum[o] > 8 || spectrum[o + 1] > 8 || spectrum[o + 2] > 8) {
        top = y;
        break;
      }
    }
    const amplitude = top < VIS_H ? VIS_H - top : 0;
    const height = Math.max(
      MIN_H,
      Math.min(
        MAX_H,
        MIN_H + Math.round((amplitude * (MAX_H - MIN_H)) / VIS_H),
      ),
    );
    const x0 = startX + position * (barW + gap);
    // Persegi panjang membulat (x0,1)–(x0+barW-1,height), radius barW/2.
    for (let y = 1; y <= height; y++)
      for (let x = x0; x < x0 + barW; x++) {
        const cx = Math.min(Math.max(x, x0 + r), x0 + barW - 1 - r),
          cy = Math.min(Math.max(y, 1 + r), height - r);
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        img[(y * VIS_W + x) * 4 + 3] = ALPHA;
      }
  });
  return img;
}
// Overlay visualizer (.mov qtrle beralfa) dari audio akhir; frame digambar
// dan ditulis satu per satu.
async function buildOverlay(audio: string, out: string) {
  const spectrum = await run("ffmpeg", [
    "-v",
    "error",
    "-i",
    audio,
    "-filter_complex",
    `[0:a]showfreqs=s=${BANDS}x${VIS_H}:r=${FPS}:mode=bar:ascale=log:fscale=log:colors=white,format=rgb24[spectrum]`,
    "-map",
    "[spectrum]",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-",
  ]);
  const frameBytes = BANDS * VIS_H * 3;
  const frames = Math.floor(spectrum.length / frameBytes);
  if (!frames) throw Error("Visualizer audio tidak menerima frame audio");
  function* generate() {
    for (let i = 0; i < frames; i++)
      yield visualizerFrame(
        spectrum.subarray(i * frameBytes, (i + 1) * frameBytes),
      );
  }
  await pipeFrames(
    [
      "-y",
      "-v",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      `${VIS_W}x${VIS_H}`,
      "-r",
      String(FPS),
      "-i",
      "-",
      "-an",
      "-c:v",
      "qtrle",
      "-pix_fmt",
      "argb",
      out,
    ],
    generate(),
  );
}
// Timeline bersama: jumlah frame tiap klip, audio akhir (AAC, semua narasi +
// CTA digabung dengan crossfade yang sama dengan dissolve video), dan overlay
// visualizer. Tidak bergantung ukuran video, jadi video lain yang memakai
// narasi dan jeda yang sama memakai hasil yang sama (cache).
export interface Timeline {
  clipFrames: number[]; // slide + CTA
  total: number;
  audio: string;
  overlay: string;
}
async function ctaFrames() {
  const info = (await streams(CLOSING_CTA_VIDEO)).find(
    (s) => s.codec_type === "video",
  );
  const seconds = Number(info?.duration) || (await duration(CLOSING_CTA_VIDEO));
  return Math.floor(seconds * FPS);
}
async function createTimeline(
  audios: string[],
  gap: number,
  dir: string,
): Promise<Timeline> {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const clipFrames: number[] = [];
  for (const file of audios)
    clipFrames.push(Math.ceil((await duration(file)) * FPS - 1e-6) + gap);
  clipFrames.push(await ctaFrames());
  const plan = planTimeline(clipFrames);
  // Satu proses audio: tiap narasi diberi jeda lalu dipotong tepat sepanjang
  // klipnya, lalu di-crossfade berantai selebar dissolve.
  const inputs = [...audios, CLOSING_CTA_VIDEO];
  const fade = (FADE_FRAMES / FPS).toFixed(6);
  const graph: string[] = [];
  inputs.forEach((_, i) => {
    const length = (clipFrames[i] / FPS).toFixed(6);
    graph.push(
      `[${i}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=mono,apad=whole_dur=${length},atrim=0:${length},asetpts=PTS-STARTPTS[a${i}]`,
    );
  });
  let previous = "a0";
  for (let i = 1; i < inputs.length; i++) {
    graph.push(`[${previous}][a${i}]acrossfade=d=${fade}[c${i}]`);
    previous = `c${i}`;
  }
  const script = path.join(dir, "audio-graph.txt");
  writeFileSync(script, graph.join(";\n"));
  const audio = path.join(dir, "audio.m4a");
  await run("ffmpeg", [
    "-y",
    "-v",
    "error",
    ...inputs.flatMap((file) => ["-i", file]),
    "-filter_complex_script",
    script,
    "-map",
    `[${previous}]`,
    "-c:a",
    "aac",
    "-b:a",
    "64k",
    audio,
  ]);
  const overlay = path.join(dir, "overlay.mov");
  await buildOverlay(audio, overlay);
  writeFileSync(
    path.join(dir, "timeline.json"),
    JSON.stringify({ clipFrames, total: plan.total }),
  );
  return { clipFrames, total: plan.total, audio, overlay };
}
function loadTimeline(dir: string): Timeline | null {
  try {
    const t = JSON.parse(readFileSync(path.join(dir, "timeline.json"), "utf8"));
    const audio = path.join(dir, "audio.m4a"),
      overlay = path.join(dir, "overlay.mov");
    return existsSync(audio) && existsSync(overlay)
      ? { clipFrames: t.clipFrames, total: t.total, audio, overlay }
      : null;
  } catch {
    return null;
  }
}
// Kunci cache = berkas audio (ukuran + waktu ubah), jeda, fps, dissolve, CTA.
function timelineKey(audios: string[], gap: number) {
  const stat = (file: string) => {
    const s = statSync(file);
    return [file, s.size, Math.round(s.mtimeMs)];
  };
  return createHash("sha1")
    .update(
      JSON.stringify([
        1,
        audios.map(stat),
        stat(CLOSING_CTA_VIDEO),
        gap,
        FPS,
        FADE_FRAMES,
      ]),
    )
    .digest("hex");
}
// cacheRoot = folder cache bagian ini; versi lama yang tidak terpakai dihapus.
async function getTimeline(
  audios: string[],
  gap: number,
  cacheRoot: string,
): Promise<Timeline> {
  const key = timelineKey(audios, gap);
  const dir = path.join(cacheRoot, key);
  const cached = loadTimeline(dir);
  if (cached) return cached;
  mkdirSync(cacheRoot, { recursive: true, mode: 0o700 });
  const tmp = `${dir}.tmp-${process.pid}-${Date.now()}`;
  try {
    await createTimeline(audios, gap, tmp);
    try {
      renameSync(tmp, dir);
    } catch {
      // Job lain selesai lebih dulu dengan kunci yang sama.
      rmSync(tmp, { recursive: true, force: true });
    }
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true });
    throw e;
  }
  for (const name of readdirSync(cacheRoot))
    if (/^[0-9a-f]{40}$/.test(name) && name !== key)
      rmSync(path.join(cacheRoot, name), { recursive: true, force: true });
  const made = loadTimeline(dir);
  if (!made) throw Error("Timeline video gagal dibuat");
  return made;
}
export interface ReelsSlide {
  image: string; // frame dalam ruang desain (PNG)
  audio: string; // narasi slide ini
  layout: BodyLayout;
  heading: string; // judul yang dibacakan lebih dulu (slide pertama)
  paragraph: string;
}
// Parameter encode sama untuk semua potongan agar bisa digabung tanpa encode
// ulang; CRF 32 = kualitas upload.
const ENCODE = [
  "-c:v",
  "libx264",
  "-preset",
  "medium",
  "-crf",
  "32",
  "-pix_fmt",
  "yuv420p",
  "-r",
  String(FPS),
  "-video_track_timescale",
  "12288",
  "-an",
];
const seconds = (frames: number) => (frames / FPS).toFixed(6);
// Gambar diam tak terbatas mulai dari frame ke-`from` (agar subtitle ASS
// menampilkan keadaan yang benar); panjang dibatasi -frames:v pada keluaran.
function stillInput(image: string, from: number) {
  return [
    ...(from ? ["-itsoffset", seconds(from)] : []),
    "-loop",
    "1",
    "-framerate",
    String(FPS),
    "-i",
    image,
  ];
}
// Overlay visualizer untuk potongan yang mulai di frame `start` timeline;
// diskalakan dari ruang 1080 ke ukuran keluaran.
function overlayChain(
  label: string,
  overlayIndex: number,
  format: VideoFormat,
) {
  const s = format.width / format.designWidth;
  return (
    `[${overlayIndex}:v]scale=${Math.round(VIS_W * s)}:${Math.round(VIS_H * s)}:flags=lanczos[ov];` +
    `[${label}][ov]overlay=x=W-w-${Math.round(24 * s)}:y=${Math.round(19 * s)}:eof_action=repeat[v]`
  );
}
async function encodePiece(
  inputs: string[],
  filter: string,
  frames: number,
  out: string,
) {
  await run("ffmpeg", [
    "-y",
    "-v",
    "error",
    ...inputs,
    "-filter_complex",
    filter,
    "-map",
    "[v]",
    "-frames:v",
    String(frames),
    ...ENCODE,
    out,
  ]);
}
// Klip → potongan → gabung tanpa encode ulang → mux audio → cek integritas.
export async function buildReels(
  slides: ReelsSlide[],
  outDir: string,
  work: string,
  format: VideoFormat,
  cacheRoot: string,
) {
  const timeline = await getTimeline(
    slides.map((s) => s.audio),
    format.gapFrames,
    cacheRoot,
  );
  const plan = planTimeline(timeline.clipFrames);
  if (timeline.total !== plan.total) throw Error("Timeline tidak konsisten");
  const n = slides.length; // klip CTA = indeks n
  // Frame ke ukuran keluaran dan ASS per slide.
  const frames: string[] = [],
    asses: string[] = [];
  const manifest = [];
  for (const [i, s] of slides.entries()) {
    const id = String(i + 1).padStart(2, "0");
    const frame = path.join(work, `frame_${id}.png`);
    await sharp(s.image)
      .resize(format.width, format.height, { kernel: "lanczos3" })
      .png({ compressionLevel: 1 })
      .toFile(frame);
    frames.push(frame);
    const narration = await duration(s.audio);
    const offset = s.heading
      ? narrationOffset(s.heading, s.paragraph, narration)
      : 0;
    const ass = path.join(work, `slide_${id}.ass`);
    writeFileSync(
      ass,
      karaokeAss(
        s.layout,
        narration,
        offset,
        format.karaoke,
        timeline.clipFrames[i] / FPS + 2,
      ),
    );
    asses.push(ass);
    manifest.push({
      slide: i + 1,
      narration_duration: +narration.toFixed(3),
      narration_offset: +offset.toFixed(3),
      frames: timeline.clipFrames[i],
    });
  }
  const subtitles = (i: number) =>
    `subtitles='${asses[i]}':fontsdir=${FONTS_DIR}`;
  const ctaFit = `scale=${format.width}:${format.height}:force_original_aspect_ratio=decrease,pad=${format.width}:${format.height}:(ow-iw)/2:(oh-ih)/2:color=0x141416,setsar=1`;
  // Sumber klip i: slide (gambar + subtitle) atau CTA (video).
  const source = (i: number, from: number) =>
    i < n
      ? {
          input: stillInput(frames[i], from),
          chain: `${subtitles(i)},setpts=PTS-STARTPTS,fps=${FPS},format=yuv420p`,
        }
      : {
          input: [
            ...(from ? ["-ss", seconds(from)] : []),
            "-i",
            CLOSING_CTA_VIDEO,
          ],
          chain: `${ctaFit},fps=${FPS},setpts=PTS-STARTPTS,format=yuv420p`,
        };
  const overlayInput = (start: number) => [
    ...(start ? ["-ss", seconds(start)] : []),
    "-i",
    timeline.overlay,
  ];
  const files: string[] = [];
  for (const [index, piece] of plan.pieces.entries()) {
    const out = path.join(work, `piece_${String(index).padStart(3, "0")}.mp4`);
    if (piece.kind === "body") {
      const src = source(piece.slide, piece.from);
      await encodePiece(
        [...src.input, ...overlayInput(piece.start)],
        `[0:v]${src.chain}[b];${overlayChain("b", 1, format)}`,
        piece.frames,
        out,
      );
    } else {
      const a = source(piece.slide, piece.from),
        b = source(piece.slide + 1, 0);
      await encodePiece(
        [...a.input, ...b.input, ...overlayInput(piece.start)],
        `[0:v]${a.chain}[a];[1:v]${b.chain}[b];` +
          `[a][b]xfade=transition=dissolve:duration=${seconds(FADE_FRAMES)}:offset=0[x];` +
          overlayChain("x", 2, format),
        piece.frames,
        out,
      );
    }
    files.push(out);
  }
  const list = path.join(work, "pieces.txt");
  writeFileSync(list, files.map((f) => `file '${f}'`).join("\n") + "\n");
  const video = path.join(outDir, "reels_video.mp4");
  await run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-i",
    timeline.audio,
    "-map",
    "0:v",
    "-map",
    "1:a",
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    video,
  ]);
  const check = await verify(video, plan.total);
  return {
    file: "reels_video.mp4",
    duration: check.duration,
    frames: plan.total,
    fps: FPS,
    width: format.width,
    height: format.height,
    integrity_check: "passed",
    slides: manifest,
  };
}
// Cek dari metadata (tanpa decode): jumlah frame video sesuai rencana, dan
// durasi video dan audio cocok (selisih ≤ 0,15 dtk).
export async function verify(file: string, expectedFrames: number) {
  const info = await streams(file);
  const v = info.find((s) => s.codec_type === "video"),
    a = info.find((s) => s.codec_type === "audio");
  if (!v || !a) throw Error("Video hasil gabungan tidak punya video/audio");
  const frames = Number(v.nb_frames);
  if (frames !== expectedFrames)
    throw Error(
      `Cek integritas video gagal: ${frames} frame, seharusnya ${expectedFrames}`,
    );
  const videoSeconds = frames / FPS,
    audioSeconds = Number(a.duration);
  if (Math.abs(videoSeconds - audioSeconds) > 0.15)
    throw Error(
      `Cek integritas video gagal: video ${videoSeconds.toFixed(2)} dtk ≠ audio ${audioSeconds.toFixed(2)} dtk`,
    );
  return { duration: +videoSeconds.toFixed(3) };
}
