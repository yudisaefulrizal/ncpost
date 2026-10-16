import { expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  filterAudioStock,
  audioDownloadName,
  createAudioZip,
  type AudioStock,
} from "../src/server/audio-stock";
import {
  audioZipFile,
  clearAudioZips,
  startAudioZip,
} from "../src/server/audio-zip-job";
import { existsSync } from "node:fs";
import { outputRoot } from "../src/server/output-paths";
import { ROOT } from "../src/server/config";
const rows: AudioStock[] = [
  {
    id: 1,
    provider: "elevenlabs",
    voice: "one",
    voiceName: "Narrator",
    text: "Hello world",
    file: "",
    updatedAt: "",
  },
  {
    id: 2,
    provider: "edge-tts",
    voice: "ardi",
    voiceName: "Ardi",
    text: "Kalimat kedua",
    file: "",
    updatedAt: "",
  },
];
it("filters text, provider and voice consistently for bulk downloads", () => {
  expect(filterAudioStock(rows, { q: "HELLO" }).map((row) => row.id)).toEqual([
    1,
  ]);
  expect(
    filterAudioStock(rows, {
      provider: "edge-tts",
      voice: "edge-tts__ardi",
    }).map((row) => row.id),
  ).toEqual([2]);
  expect(filterAudioStock(rows, { q: "missing" })).toEqual([]);
});
it("creates a ZIP with original filenames and rejects files outside the audio pool", async () => {
  vi.stubEnv("NCPOST_TEST", "true");
  const temporary = await mkdtemp(path.join(os.tmpdir(), "ncpost-zip-test-"));
  const folder = path.join(outputRoot(), "stock-audio", "zip-test");
  try {
    await mkdir(folder, { recursive: true });
    const file = path.join(folder, "voice__hello.mp3");
    await promisify(execFile)("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=0.2",
      "-ac",
      "2",
      "-ar",
      "48000",
      file,
    ]);
    const zip = path.join(temporary, "audio.zip");
    await createAudioZip(
      [
        { ...rows[0], file: path.relative(ROOT, file) },
        {
          ...rows[0],
          id: 3,
          provider: "edge-tts",
          file: path.relative(ROOT, file),
        },
        { ...rows[1], text: "x".repeat(231), file: "missing.mp3" },
      ],
      zip,
    );
    const { stdout } = await promisify(execFile)("unzip", ["-Z1", zip]);
    expect(stdout.trim()).toBe("hello-world.wav");
    await promisify(execFile)("unzip", [
      "-q",
      zip,
      "-d",
      path.join(temporary, "extracted"),
    ]);
    const { stdout: metadata } = await promisify(execFile)("ffprobe", [
      "-v",
      "error",
      "-show_streams",
      "-of",
      "json",
      path.join(temporary, "extracted", "hello-world.wav"),
    ]);
    expect(JSON.parse(metadata).streams[0]).toMatchObject({
      codec_name: "pcm_s16le",
      channels: 1,
      sample_rate: "44100",
      bits_per_sample: 16,
    });
    const outside = path.join(temporary, "outside.mp3");
    await writeFile(outside, "outside");
    await expect(
      createAudioZip([{ ...rows[0], file: path.relative(ROOT, outside) }], zip),
    ).rejects.toThrow("Path aset ditolak");
  } finally {
    await rm(folder, { recursive: true, force: true });
    await rm(temporary, { recursive: true, force: true });
    vi.unstubAllEnvs();
  }
});

async function sineAudio(folder: string) {
  await mkdir(folder, { recursive: true });
  const file = path.join(folder, "voice__hello.mp3");
  await promisify(execFile)("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=0.2",
    file,
  ]);
  return path.relative(ROOT, file);
}
it("skips audio that fails to convert and reports it", async () => {
  vi.stubEnv("NCPOST_TEST", "true");
  const temporary = await mkdtemp(path.join(os.tmpdir(), "ncpost-zip-test-"));
  const folder = path.join(outputRoot(), "stock-audio", "zip-skip-test");
  try {
    const file = await sineAudio(folder);
    const zip = path.join(temporary, "audio.zip");
    const progress: number[] = [];
    const result = await createAudioZip(
      [
        { ...rows[0], file },
        { ...rows[1], file: path.relative(ROOT, path.join(folder, "x.mp3")) },
      ],
      zip,
      (done) => progress.push(done),
    );
    expect(result).toEqual({ files: 1, failed: ["kalimat-kedua.wav"] });
    expect(progress).toEqual([1, 2]);
    const { stdout } = await promisify(execFile)("unzip", ["-Z1", zip]);
    expect(stdout.trim()).toBe("hello-world.wav");
  } finally {
    await rm(folder, { recursive: true, force: true });
    await rm(temporary, { recursive: true, force: true });
    vi.unstubAllEnvs();
  }
});
it("prepares one background ZIP at a time and keeps it for download", async () => {
  vi.stubEnv("NCPOST_TEST", "true");
  const folder = path.join(outputRoot(), "stock-audio", "zip-job-test");
  try {
    const file = await sineAudio(folder);
    const job = startAudioZip([{ ...rows[0], file }]);
    expect(job).toMatchObject({ status: "running", done: 0, total: 1 });
    expect(startAudioZip([{ ...rows[1], file }])).toBe(job);
    await vi.waitFor(() => expect(job.status).toBe("done"), {
      timeout: 10000,
    });
    expect(job.done).toBe(1);
    expect(job.size).toBeGreaterThan(0);
    expect(existsSync(audioZipFile(job.id))).toBe(true);
    await clearAudioZips();
    expect(existsSync(audioZipFile(job.id))).toBe(false);
    expect(() =>
      startAudioZip([{ ...rows[0], text: "x".repeat(231) }]),
    ).toThrow("Tidak ada audio dengan teks maksimal 230 karakter");
  } finally {
    await clearAudioZips();
    await rm(folder, { recursive: true, force: true });
    vi.unstubAllEnvs();
  }
});

it("uses narration-only filenames and skips text longer than 230 characters", () => {
  expect(audioDownloadName("Halo, ini suara!")).toBe("halo-ini-suara.wav");
  expect(audioDownloadName("a".repeat(230))).toBe("a".repeat(230) + ".wav");
  expect(audioDownloadName("a".repeat(231))).toBeNull();
});
