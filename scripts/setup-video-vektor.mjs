import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
const root = path.resolve(
  process.cwd(),
  process.env.VIDEO_VEKTOR_ROOT || "engines/video-vektor",
);
if (Number(process.versions.node.split(".")[0]) < 22)
  throw Error("Video Vektor memerlukan Node.js 22+.");
const run = (exe, args) => {
  const result = spawnSync(exe, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (result.error || result.status !== 0)
    throw Error(
      `Persiapan Video Vektor gagal: ${exe}. ${result.error?.message || ""}`,
    );
};
const key = createHash("sha256")
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
  run("npm", ["ci", "--no-audit", "--no-fund"]);
  run("python3", ["-m", "venv", ".venv"]);
  run(path.join(root, ".venv/bin/python"), [
    "-m",
    "pip",
    "install",
    "-r",
    "requirements.txt",
  ]);
  writeFileSync(marker, key + "\n");
}
for (const exe of ["ffmpeg", "ffprobe"]) run(exe, ["-version"]);
if (!existsSync("/usr/bin/google-chrome"))
  throw Error(
    "Pasang Google Chrome di /usr/bin/google-chrome sesuai renderer Video Vektor.",
  );
console.log(
  "Video Vektor siap. Codex mengikuti CODEX_EXECUTABLE/CODEX_MODEL ncpost; pastikan CLI sudah login sebagai user worker.",
);
