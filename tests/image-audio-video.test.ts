import { it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { run } from "../src/server/video";
import { buildImageAudioVideo } from "../src/server/image-audio-video";
it("renders ordered images and matching audio without subtitles, template, visualizer or closing", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ncpost-image-audio-"));
  try {
    const audio = path.join(dir, "audio.wav");
    await run("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=0.25",
      audio,
    ]);
    const slides = [];
    for (const [index, color] of ["red", "blue"].entries()) {
      const image = path.join(dir, `${index}.png`);
      await sharp({
        create: { width: 90, height: 160, channels: 3, background: color },
      })
        .png()
        .toFile(image);
      slides.push({ image, audio });
    }
    const output = path.join(dir, "video.mp4");
    const result = await buildImageAudioVideo(slides, output, dir, {
      width: 90,
      height: 160,
    });
    expect(result).toMatchObject({
      mode: "image_audio",
      frames: 12,
      width: 90,
      height: 160,
      integrity_check: "passed",
    });
    expect(result.duration).toBeCloseTo(0.5, 1);
    expect(result.slides).toHaveLength(2);
    const probe = JSON.parse(
      (
        await run("ffprobe", [
          "-v",
          "error",
          "-show_streams",
          "-of",
          "json",
          output,
        ])
      ).toString(),
    );
    expect(probe.streams.map((stream: any) => stream.codec_type)).toEqual([
      "video",
      "audio",
    ]);
    for (const [time, channel] of [
      ["0.08", 0],
      ["0.35", 2],
    ] as const) {
      const frame = await run("ffmpeg", [
        "-v",
        "error",
        "-ss",
        time,
        "-i",
        output,
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "pipe:1",
      ]);
      for (let pixel = 0; pixel < frame.length; pixel += 3) {
        expect(frame[pixel + channel]).toBeGreaterThan(235);
        expect(frame[pixel + (channel === 0 ? 2 : 0)]).toBeLessThan(20);
      }
    }
    // A failed regeneration must leave an existing video intact.
    const before = readFileSync(output);
    await expect(
      buildImageAudioVideo(
        [{ image: slides[0].image, audio: path.join(dir, "missing.wav") }],
        output,
        dir,
      ),
    ).rejects.toThrow();
    expect(readFileSync(output)).toEqual(before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 20000);
