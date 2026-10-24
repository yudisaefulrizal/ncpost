// Video Animasi 2D (gaya Nus 2D Studio) sebagai gaya Video V/H: narasi =
// audio kolom Audio (teks artikel apa adanya) -> Codex mengelompokkan bagian
// narasi menjadi adegan dan memilih ilustrasinya -> frame SVG digambar resvg
// satu per satu (tanpa browser, satu core) langsung ke ffmpeg -> cek integritas.
import { Resvg } from "@resvg/resvg-js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { checkGeneration } from "../generation-cancel";
import { live } from "../live";
import { stockMetadata } from "../media-stock";
import { outputRoot } from "../output-paths";
import {
  FPS,
  LANDSCAPE,
  VERTICAL,
  VIDEO_COLOR_FILTER,
  duration,
  pipeFrames,
  run,
  verify,
} from "../video";
import { renderFrame, setVideo } from "./frame";
import { scriptPrompt, writeScript, type Script } from "./script";
import {
  LEAD,
  TAIL,
  GAP,
  charsToWords,
  sceneTimeline,
  spokenText,
  type Piece,
} from "./timeline";

/** Nama lajur stok Video Animasi 2D (Stok Konten Video). */
export const ANIMATION_PRESET = "ANIMASI_2D";
const BRAND = "nus";

export interface AnimationInput {
  title: string;
  /** Bagian narasi urut: teks yang dibacakan dan berkas audionya. */
  units: { text: string; file: string }[];
  horizontal: boolean;
  work: string;
  force: boolean;
  ask: (prompt: string) => Promise<string>;
}

// Naskah dipakai bersama Video V dan H dari narasi yang sama, agar isi
// keduanya sama dan Codex cukup dipanggil sekali. Kunci = prompt lengkap,
// jadi perubahan narasi atau prompts/video-2d/naskah.md membuat naskah baru.
async function sharedScript(input: AnimationInput, texts: string[]) {
  const key = createHash("sha256")
    .update(scriptPrompt(input.title, texts))
    .digest("hex")
    .slice(0, 32);
  const file = path.join(outputRoot(), "cache/anim2d", key, "script.json");
  if (!input.force && existsSync(file))
    return JSON.parse(readFileSync(file, "utf8")) as Script;
  live("Menyusun adegan animasi…");
  const script = await writeScript(input.title, texts, input.ask);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(script, null, 2));
  return script;
}

// Waktu kata dari audio: timing per huruf yang disimpan saat audio dibuat;
// audio lama tanpa timing dibagi menurut panjang kata.
async function piece(unit: { text: string; file: string }): Promise<Piece> {
  const seconds = await duration(unit.file);
  const alignment = (await stockMetadata("audio", unit.file))?.alignment;
  return {
    text: unit.text,
    seconds,
    words: alignment ? charsToWords(unit.text, alignment) : [],
  };
}

// Audio akhir: tiap bagian narasi diberi LEAD di awal adegan, GAP antarbagian,
// TAIL di akhir adegan, dan dipotong tepat sepanjang bagiannya.
async function narrationTrack(files: string[], pieces: Piece[][], out: string) {
  const graph: string[] = [];
  let index = 0;
  pieces.forEach((list) => {
    list.forEach((p, j) => {
      const lead = j === 0 ? LEAD : 0,
        tail = j === list.length - 1 ? TAIL : GAP;
      const length = (lead + p.seconds + tail).toFixed(6);
      graph.push(
        `[${index}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=mono,adelay=${Math.round(lead * 1000)}:all=1,apad=whole_dur=${length},atrim=0:${length},asetpts=PTS-STARTPTS[a${index}]`,
      );
      index++;
    });
  });
  graph.push(
    `${files.map((_, i) => `[a${i}]`).join("")}concat=n=${files.length}:v=0:a=1[a]`,
  );
  const script = path.join(path.dirname(out), "audio-graph.txt");
  writeFileSync(script, graph.join(";\n"));
  await run("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-threads",
    "1",
    ...files.flatMap((file) => ["-i", file]),
    "-filter_complex_script",
    script,
    "-map",
    "[a]",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    out,
  ]);
}

/** Buat Video Animasi 2D ke berkas out; hasilnya metadata untuk manifest. */
export async function buildAnimationVideo(input: AnimationInput, out: string) {
  const work = path.join(input.work, "anim2d");
  mkdirSync(work, { recursive: true, mode: 0o700 });
  const texts = input.units.map((u) => spokenText(u.text));
  const script = await sharedScript(input, texts);
  writeFileSync(
    path.join(work, "script.json"),
    JSON.stringify(script, null, 2),
  );
  const pieces = await Promise.all(input.units.map(piece));
  return renderAnimation(
    script,
    input.units,
    pieces,
    input.horizontal,
    work,
    out,
  );
}

/** Gambar naskah bernarasi menjadi video (frame demi frame, satu core). */
export async function renderAnimation(
  script: Script,
  units: { file: string }[],
  pieces: Piece[],
  horizontal: boolean,
  work: string,
  out: string,
) {
  const format = horizontal ? LANDSCAPE : VERTICAL;
  // Bagian narasi tiap adegan; naskah tanpa from/count = satu bagian per adegan.
  const grouped = script.scenes.map((sc, i) =>
    pieces.slice(sc.from ?? i, (sc.from ?? i) + (sc.count ?? 1)),
  );
  const timeline = sceneTimeline(script, grouped);
  const audio = path.join(work, "narasi.m4a");
  await narrationTrack(
    script.scenes.flatMap((sc, i) =>
      units
        .slice(sc.from ?? i, (sc.from ?? i) + (sc.count ?? 1))
        .map((u) => u.file),
    ),
    grouped,
    audio,
  );

  setVideo({
    W: format.width,
    H: format.height,
    brand: BRAND,
    world: script.world,
    ...timeline,
  });
  const frames = Math.ceil(timeline.total * FPS - 1e-6);
  const options = { font: { loadSystemFonts: false } };
  function* generate() {
    for (let i = 0; i < frames; i++) {
      checkGeneration();
      if (i % FPS === 0) live(`Menggambar frame ${i + 1}/${frames}…`);
      yield new Resvg(renderFrame(i / FPS), options).render().pixels;
    }
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
      `${format.width}x${format.height}`,
      "-r",
      String(FPS),
      "-i",
      "-",
      "-i",
      audio,
      "-map",
      "0:v",
      "-map",
      "1:a",
      "-vf",
      VIDEO_COLOR_FILTER,
      "-frames:v",
      String(frames),
      "-c:v",
      "libx264",
      "-threads",
      "1",
      "-preset",
      "medium",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-color_range",
      "tv",
      "-r",
      String(FPS),
      "-video_track_timescale",
      "12288",
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      out,
    ],
    generate(),
  );
  const check = await verify(out, frames);
  return {
    file: path.basename(out),
    mode: "anim2d",
    title: script.title,
    scenes: script.scenes.length,
    duration: check.duration,
    frames,
    fps: FPS,
    width: format.width,
    height: format.height,
    integrity_check: "passed",
  };
}
