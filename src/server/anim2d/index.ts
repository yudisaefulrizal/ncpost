// Video Animasi 2D (gaya Nus 2D Studio) sebagai gaya Video V/H: artikel ->
// naskah adegan (Codex) -> narasi per adegan (suara Daftar Suara, disimpan di
// stok audio) -> frame SVG digambar resvg satu per satu (tanpa browser, satu
// core) langsung ke ffmpeg -> cek integritas.
import { Resvg } from "@resvg/resvg-js";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { checkGeneration } from "../generation-cancel";
import { live } from "../live";
import { sharedMedia, stockMetadata } from "../media-stock";
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
import { generateTimedVoiceAudio, voiceRecipe, type Voice } from "../voices";
import { renderFrame, setVideo } from "./frame";
import { scriptPrompt, writeScript, type Script } from "./script";
import { sanitizeForTts } from "../tts-text";
import {
  LEAD,
  charsToWords,
  sceneTimeline,
  spreadWords,
  type Alignment,
} from "./timeline";
import type { Word } from "./state";

/** Nama lajur stok Video Animasi 2D (Stok Konten Video). */
export const ANIMATION_PRESET = "ANIMASI_2D";
const BRAND = "nus";

export interface AnimationInput {
  title: string;
  article: string;
  voice: Voice;
  horizontal: boolean;
  work: string;
  force: boolean;
  ask: (prompt: string) => Promise<string>;
}

// Naskah dipakai bersama Video V dan H dari artikel yang sama, agar isi
// keduanya sama dan Codex cukup dipanggil sekali. Kunci = prompt lengkap,
// jadi perubahan artikel atau prompts/video-2d/naskah.md membuat naskah baru.
async function sharedScript(input: AnimationInput): Promise<Script> {
  const key = createHash("sha256")
    .update(scriptPrompt(input.title, input.article))
    .digest("hex")
    .slice(0, 32);
  const file = path.join(outputRoot(), "cache/anim2d", key, "script.json");
  if (!input.force && existsSync(file))
    return JSON.parse(readFileSync(file, "utf8"));
  live("Menulis naskah animasi…");
  const script = await writeScript(input.title, input.article, input.ask);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, JSON.stringify(script, null, 2));
  return script;
}

// Narasi satu adegan: dibuat dan disimpan seperti audio lain di stok audio;
// waktu tiap kata ikut disimpan sebagai metadata stok.
async function narrate(voice: Voice, text: string) {
  const spoken = sanitizeForTts(text);
  let alignment: Alignment | null = null;
  const file = await sharedMedia({
    category: "audio",
    identity: [voice.provider, voice.voice_id],
    text: spoken,
    prompt: JSON.stringify({ ...voiceRecipe(voice), timing: true }),
    generate: async (temporary) => {
      alignment = await generateTimedVoiceAudio(voice, spoken, temporary);
    },
    details: () => (alignment ? { alignment } : undefined),
  });
  const seconds = await duration(file);
  const saved = alignment ?? (await stockMetadata("audio", file))?.alignment;
  const words: Word[] = saved
    ? charsToWords(spoken, saved)
    : spreadWords(spoken, seconds);
  return { file, seconds, words };
}

// Audio akhir: narasi tiap adegan diberi jeda LEAD di depan dan dipotong
// tepat sepanjang adegannya.
async function narrationTrack(
  files: string[],
  scenes: { dur: number }[],
  out: string,
) {
  const graph = files
    .map(
      (_, i) =>
        `[${i}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=mono,adelay=${Math.round(LEAD * 1000)}:all=1,apad=whole_dur=${scenes[i].dur.toFixed(6)},atrim=0:${scenes[i].dur.toFixed(6)},asetpts=PTS-STARTPTS[a${i}]`,
    )
    .concat(
      `${files.map((_, i) => `[a${i}]`).join("")}concat=n=${files.length}:v=0:a=1[a]`,
    )
    .join(";\n");
  const script = path.join(path.dirname(out), "audio-graph.txt");
  writeFileSync(script, graph);
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
  const script = await sharedScript(input);
  writeFileSync(
    path.join(work, "script.json"),
    JSON.stringify(script, null, 2),
  );
  const narration = [];
  for (const [i, sc] of script.scenes.entries()) {
    live(`Suara adegan ${i + 1}/${script.scenes.length}…`);
    narration.push(await narrate(input.voice, sc.narration));
  }
  return renderAnimation(script, narration, input.horizontal, work, out);
}

/** Gambar naskah bernarasi menjadi video (frame demi frame, satu core). */
export async function renderAnimation(
  script: Script,
  narration: { file: string; seconds: number; words: Word[] }[],
  horizontal: boolean,
  work: string,
  out: string,
) {
  const format = horizontal ? LANDSCAPE : VERTICAL;
  const timeline = sceneTimeline(script, narration);
  const audio = path.join(work, "narasi.m4a");
  await narrationTrack(
    narration.map((n) => n.file),
    timeline.scenes,
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
