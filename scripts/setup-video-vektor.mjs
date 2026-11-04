import { spawn } from "node:child_process";
import { preparePython } from "./video-vektor-pip.mjs";
import { prepareBrowser, verifyCpuWebGl } from "./video-vektor-browser.mjs";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

const root = path.resolve(
  process.cwd(),
  process.env.VIDEO_VEKTOR_ROOT || "engines/video-vektor",
);
if (Number(process.versions.node.split(".")[0]) < 22)
  throw Error("Video Vektor memerlukan Node.js 22+.");
const run = (exe, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      cwd: root,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", (error) =>
      reject(Error(`Persiapan Video Vektor gagal: ${exe}. ${error.message}`)),
    );
    child.once("close", (code) =>
      code === 0
        ? resolve()
        : reject(Error(`Persiapan Video Vektor gagal: ${exe} (exit ${code}).`)),
    );
  });
const key = createHash("sha256")
  .update("setup-v4")
  .update(readFileSync(path.join(root, "package-lock.json")))
  .update(readFileSync(path.join(root, "requirements.txt")))
  .update(process.versions.node.split(".")[0])
  .digest("hex");
const marker = path.join(root, ".setup-version");
if (
  existsSync(marker) &&
  readFileSync(marker, "utf8").trim() === key &&
  existsSync(path.join(root, "node_modules/remotion/package.json")) &&
  existsSync(path.join(root, ".venv/bin/python"))
) {
  console.log("Dependensi Video Vektor sudah siap.");
} else {
  // The renderer also needs the pinned tooling when the service uses NODE_ENV=production.
  await run("npm", ["ci", "--include=dev", "--no-audit", "--no-fund"]);
  await preparePython({ root, run });
  await run(path.join(root, ".venv/bin/python"), [
    "-m",
    "pip",
    "install",
    "-r",
    "requirements.txt",
  ]);
}
await run(path.join(root, ".venv/bin/python"), [
  "-c",
  "import edge_tts, numpy",
]);
for (const exe of ["ffmpeg", "ffprobe"]) await run(exe, ["-version"]);
const executable = await prepareBrowser({ root, run });
await verifyCpuWebGl({ root, executable });
if (!existsSync(`/run/user/${process.getuid?.()}/bus`)) {
  console.warn(
    "Batas RAM Video Vektor belum siap: layanan pengguna systemd belum aktif. Jalankan sekali sebagai admin: sudo bash deploy/enable-video-vektor-limits.sh <user-worker>. Produksi tidak dijalankan sebelum aktivasi ini.",
  );
}
// A cancelled or failed setup never claims the engine is ready.
const temporary = `${marker}.${randomUUID()}.tmp`;
try {
  writeFileSync(temporary, key + "\n");
  renameSync(temporary, marker);
} finally {
  rmSync(temporary, { force: true });
}
console.log(
  "Video Vektor siap. Codex mengikuti CODEX_EXECUTABLE/CODEX_MODEL ncpost; pastikan CLI sudah login sebagai user worker.",
);
