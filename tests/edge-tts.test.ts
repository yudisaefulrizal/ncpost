import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { edgeTts, newsTtsConfig } from "../src/server/edge-tts";
let dir: string;
let executable: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "ncpost edge tts "));
  executable = path.join(dir, "fake-tts.cjs");
  writeFileSync(
    executable,
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const input = args[args.indexOf('--file') + 1];
const output = args[args.indexOf('--write-media') + 1];
fs.writeFileSync(output + '.args.json', JSON.stringify({ args, text: fs.readFileSync(input, 'utf8'), secret: process.env.ELEVENLABS_API_KEY }));
fs.writeFileSync(output, Buffer.alloc(120));
`,
    { mode: 0o700 },
  );
  vi.stubEnv("EDGE_TTS_EXECUTABLE", executable);
  vi.stubEnv("NEWS_EDGE_TTS", "true");
  vi.stubEnv("NEWS_EDGE_TTS_VOICE", "id-ID-ArdiNeural");
  vi.stubEnv("NEWS_EDGE_TTS_RATE", "+0%");
  vi.stubEnv("LIVE_TTS", "false");
  vi.stubEnv("ELEVENLABS_API_KEY", "test-secret-never-forward");
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});
it("audio berita mandiri dari ElevenLabs, teks panjang dikirim sebagai berkas tanpa shell", async () => {
  const file = path.join(dir, "audio.mp3");
  const text =
    'Berita teknologi. $(jangan-jalankan) `perintah` "kutip"\n'.repeat(5000);
  expect(newsTtsConfig().enabled).toBe(true);
  await edgeTts(text, file);
  const capture = JSON.parse(readFileSync(file + ".args.json", "utf8"));
  expect(capture.text).toBe(text);
  expect(capture.args).toContain("id-ID-ArdiNeural");
  expect(capture.args).toContain("--rate=+0%");
  expect(capture.secret).toBeUndefined();
  expect(existsSync(file)).toBe(true);
  expect(existsSync(file + ".txt")).toBe(false);
});
it("kegagalan proses menghapus audio parsial dan input", async () => {
  writeFileSync(
    executable,
    "#!/usr/bin/env node\nrequire('node:fs').writeFileSync(process.argv.at(-1), 'partial'); process.exit(1);",
    { mode: 0o700 },
  );
  const file = path.join(dir, "failed.mp3");
  await expect(edgeTts("Kalimat berita.", file)).rejects.toThrow(
    "Edge TTS gagal",
  );
  expect(existsSync(file)).toBe(false);
  expect(existsSync(file + ".txt")).toBe(false);
});
it("audio kosong ditolak dan tidak ada fallback saat Edge TTS dinonaktifkan", async () => {
  writeFileSync(executable, "#!/usr/bin/env node\n", { mode: 0o700 });
  const file = path.join(dir, "empty.mp3");
  await expect(edgeTts("Kalimat berita.", file)).rejects.toThrow(
    "tidak menghasilkan audio MP3",
  );
  vi.stubEnv("NEWS_EDGE_TTS", "false");
  await expect(edgeTts("Kalimat berita.", file)).rejects.toThrow(
    "dinonaktifkan",
  );
  vi.stubEnv("NEWS_EDGE_TTS", "true");
  vi.stubEnv("EDGE_TTS_EXECUTABLE", path.join(dir, "missing"));
  expect(newsTtsConfig().enabled).toBe(false);
});
