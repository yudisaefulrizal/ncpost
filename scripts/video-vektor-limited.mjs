import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const MEMORY_MAX = 2_000_000_000;
// Verify the kernel boundary before loading setup, Codex, audio, or the renderer.
// A Node heap limit alone does not include Chromium/FFmpeg/Python descendants.
export function memoryBoundary({
  read = (file) => readFileSync(file, "utf8"),
} = {}) {
  const group = read("/proc/self/cgroup")
    .split("\n")
    .find((line) => line.startsWith("0::"))
    ?.slice(3);
  if (!group || group.split("/").includes(".."))
    throw Error("Video Vektor memerlukan cgroup v2 untuk batas RAM 2 GB.");
  const dir = path.join("/sys/fs/cgroup", group);
  const max = Number(read(path.join(dir, "memory.max")).trim());
  const swap = Number(read(path.join(dir, "memory.swap.max")).trim());
  if (!Number.isSafeInteger(max) || max <= 0 || max > MEMORY_MAX || swap !== 0)
    throw Error(
      "Batas RAM Video Vektor 2 GB belum aktif; produksi tidak dijalankan.",
    );
  return dir;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const dir = memoryBoundary();
    const script = process.argv[2];
    if (!script) throw Error("Script produksi Video Vektor belum diberikan.");
    console.error(
      "Video Vektor: cgroup aktif, RAM maksimal 2 GB, swap 0, render CPU swangle.",
    );
    process.on("exit", () => {
      try {
        console.error(
          `Video Vektor: puncak memori cgroup ${readFileSync(path.join(dir, "memory.peak"), "utf8").trim()} byte.`,
        );
      } catch {
        /* Older cgroup v2 kernels do not expose memory.peak. */
      }
    });
    process.argv = [process.execPath, ...process.argv.slice(2)];
    await import(pathToFileURL(script).href);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
