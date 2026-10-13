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
    await writeFile(file, "audio-test");
    const zip = path.join(temporary, "audio.zip");
    await createAudioZip(
      [
        { ...rows[0], file: path.relative(ROOT, file) },
        { ...rows[1], text: "x".repeat(231), file: "missing.mp3" },
      ],
      zip,
    );
    const { stdout } = await promisify(execFile)("unzip", ["-Z1", zip]);
    expect(stdout.trim()).toBe("elevenlabs__one/hello-world.mp3");
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

it("uses narration-only filenames and skips text longer than 230 characters", () => {
  expect(audioDownloadName("Halo, ini suara!")).toBe("halo-ini-suara.mp3");
  expect(audioDownloadName("a".repeat(230))).toBe("a".repeat(230) + ".mp3");
  expect(audioDownloadName("a".repeat(231))).toBeNull();
});
