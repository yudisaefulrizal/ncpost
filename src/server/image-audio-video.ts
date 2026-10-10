import path from "node:path";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { duration, run, verify, FPS, VERTICAL } from "./video";

// Final-designed images are used unchanged: no text, template, visualizer or CTA.
export async function buildImageAudioVideo(
  slides: { image: string; audio: string }[],
  output: string,
  work: string,
  format: { width: number; height: number } = VERTICAL,
) {
  if (!slides.length) throw Error("Video membutuhkan gambar dan audio");
  mkdirSync(work, { recursive: true });
  mkdirSync(path.dirname(output), { recursive: true });
  const stage = mkdtempSync(path.join(work, "image-audio-"));
  try {
    const manifest = [];
    const files = [];
    let frames = 0;
    for (const [index, slide] of slides.entries()) {
      const seconds = await duration(slide.audio);
      if (!Number.isFinite(seconds) || seconds <= 0)
        throw Error(`Audio ${index + 1} tidak valid`);
      const count = Math.ceil(seconds * FPS);
      const length = count / FPS;
      const file = path.join(stage, `slide-${index}.mkv`);
      await run("ffmpeg", [
        "-y",
        "-v",
        "error",
        "-threads",
        "1",
        "-loop",
        "1",
        "-framerate",
        String(FPS),
        "-i",
        slide.image,
        "-i",
        slide.audio,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-vf",
        `scale=${format.width}:${format.height}:force_original_aspect_ratio=decrease,pad=${format.width}:${format.height}:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1`,
        "-af",
        `apad,atrim=duration=${length},asetpts=PTS-STARTPTS`,
        "-t",
        String(length),
        "-c:v",
        "libx264",
        "-threads",
        "1",
        "-preset",
        "fast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "pcm_s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        file,
      ]);
      files.push(file);
      frames += count;
      manifest.push({ index: index + 1, frames: count, duration: length });
    }
    const list = path.join(stage, "slides.txt");
    // Only locally generated relative basenames are written to the concat list.
    writeFileSync(
      list,
      files.map((file) => `file '${path.basename(file)}'`).join("\n"),
    );
    const result = path.join(stage, "video.mp4");
    await run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "concat",
      "-safe",
      "1",
      "-i",
      list,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-movflags",
      "+faststart",
      result,
    ]);
    const checked = await verify(result, frames);
    renameSync(result, output);
    return {
      file: path.basename(output),
      duration: checked.duration,
      frames,
      fps: FPS,
      width: format.width,
      height: format.height,
      integrity_check: "passed",
      mode: "image_audio",
      slides: manifest,
    };
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
