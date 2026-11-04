import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { ROOT, privateEnv } from "./config";
import { generationSignal } from "./generation-cancel";
import { live } from "./live";
import { chapterDir } from "./output-paths";
import type { Chapter, Job } from "./store";

export const VECTOR_FILES = [
  "video.mp4",
  "narasi.wav",
  "musik.wav",
  "audio-final.wav",
  "naskah.json",
  "subtitle.srt",
] as const;
export const vectorRoot = () =>
  path.resolve(ROOT, process.env.VIDEO_VEKTOR_ROOT || "engines/video-vektor");
export function vectorRequest(c: Chapter, j: Job, root = vectorRoot()) {
  const id = `ncpost-t${c.content_type_id ?? 1}-c${c.id}-r${j.revision}`;
  if (!/^ncpost-t\d+-c\d+-r\d+$/.test(id) || id.length > 72)
    throw Error("ID Video Vektor tidak valid");
  const args = [
    path.join(root, "scripts/video.mjs"),
    "--title",
    c.title,
    "--id",
    id,
    "--timeout",
    "0",
  ];
  // Failed/cancelled attempts resume; only an explicit regenerate rebuilds the script.
  if (j.force_new) args.push("--regenerate", "--replan", "--force");
  return {
    id,
    args,
    output: path.join(root, "hasil", id),
    cache: path.join(root, ".cache/video-pipeline/projects", id),
  };
}
const read = (file: string): any => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== "ESRCH";
  }
};

/** Serialize complete productions across workers; the original renderer keeps its own lock. */
export async function vectorLock(root: string, signal?: AbortSignal) {
  const file = path.join(root, ".cache/video-pipeline/ncpost.lock");
  mkdirSync(path.dirname(file), { recursive: true });
  const token = randomUUID();
  for (;;) {
    signal?.throwIfAborted();
    try {
      const fd = openSync(file, "wx", 0o600);
      try {
        writeFileSync(fd, JSON.stringify({ pid: process.pid, token }));
      } finally {
        closeSync(fd);
      }
      return () => {
        if (read(file)?.token === token) rmSync(file, { force: true });
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const owner = read(file);
      if (
        !owner &&
        existsSync(file) &&
        Date.now() - statSync(file).mtimeMs > 5000
      )
        throw Error(
          `Kunci Video Vektor tidak valid: ${file}. Periksa proses worker sebelum membersihkannya.`,
        );
      if (
        owner &&
        Number.isSafeInteger(owner.pid) &&
        owner.pid > 0 &&
        !alive(owner.pid)
      ) {
        if (read(file)?.token === owner.token) rmSync(file, { force: true });
        continue;
      }
      live("Menunggu giliran produksi Video Vektor…");
      await delay(500, undefined, { signal });
    }
  }
}
const exec = promisify(execFile);
export async function probeVector(file: string, signal?: AbortSignal) {
  const { stdout } = await exec(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,avg_frame_rate,nb_frames:format=duration",
      "-of",
      "json",
      file,
    ],
    { signal },
  );
  const data = JSON.parse(stdout),
    stream = data.streams?.[0];
  if (stream?.width !== 1920 || stream?.height !== 1080)
    throw Error(
      "Hasil Video Vektor harus 1920×1080; video tidak diubah ukurannya",
    );
  const [num, den] = String(stream.avg_frame_rate).split("/").map(Number);
  const fps = num / den,
    duration = Number(data.format?.duration);
  if (!(duration > 0) || !(fps > 0))
    throw Error("Metadata Video Vektor tidak lengkap");
  return {
    width: 1920,
    height: 1080,
    fps,
    duration,
    frames: Number(stream.nb_frames) || Math.round(duration * fps),
  };
}
function runPipeline(
  request: ReturnType<typeof vectorRequest>,
  root: string,
  signal?: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const child = spawn(process.execPath, request.args, {
      cwd: root,
      shell: false,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      // Use ncpost's executable/model and private environment; no DB/API secrets.
      env: {
        ...privateEnv(),
        CODEX_BIN: process.env.CODEX_EXECUTABLE || "codex",
        ...(process.env.CODEX_MODEL
          ? { CODEX_MODEL: process.env.CODEX_MODEL }
          : {}),
        ...Object.fromEntries(
          ["TTS_VOICE", "TTS_RATE", "REMOTION_GL"]
            .filter((k) => process.env[k])
            .map((k) => [k, process.env[k]!]),
        ),
      },
    });
    let tail = "",
      force: NodeJS.Timeout | undefined;
    const capture = (b: Buffer) => {
      tail = (tail + b.toString()).slice(-8000);
    };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    const progress = setInterval(() => {
      const state = read(path.join(request.cache, "status.json"));
      if (state?.pid !== child.pid) return;
      const rendered = state.render;
      live(
        [
          state.message,
          rendered?.total
            ? `${rendered.completed ?? 0}/${rendered.total} frame`
            : "",
        ]
          .filter(Boolean)
          .join(" · "),
      );
    }, 1000);
    const abort = () => {
      // Let the original runner stop its Codex/audio/render descendants and clean up.
      child.kill("SIGTERM");
      force = setTimeout(() => {
        try {
          if (child.pid) process.kill(-child.pid, "SIGKILL");
        } catch {}
      }, 5000);
      force.unref();
    };
    signal?.addEventListener("abort", abort, { once: true });
    const clean = () => {
      clearInterval(progress);
      clearTimeout(force);
      signal?.removeEventListener("abort", abort);
    };
    child.once("error", (e) => {
      clean();
      reject(e);
    });
    child.once("close", (code) => {
      clean();
      if (signal?.aborted) reject(signal.reason);
      else if (code !== 0)
        reject(
          Error(
            `Produksi Video Vektor gagal. ${tail.trim()}\nLog: ${path.join(request.cache, "production.log")}`,
          ),
        );
      else resolve();
    });
    if (signal?.aborted) abort();
  });
}
/** Runs the bundled, unchanged pipeline; publishes byte-for-byte copies into ncpost. */
export async function buildVideoVektor(
  c: Chapter,
  j: Job,
  options: {
    root?: string;
    signal?: AbortSignal;
    run?: typeof runPipeline;
    probe?: typeof probeVector;
  } = {},
) {
  const root = options.root ?? vectorRoot(),
    signal = options.signal ?? generationSignal();
  for (const file of [
    "scripts/video.mjs",
    "node_modules/remotion/package.json",
  ])
    if (!existsSync(path.join(root, file)))
      throw Error(
        "Video Vektor belum disiapkan. Jalankan npm run setup:video-vektor di server.",
      );
  const request = vectorRequest(c, j, root),
    release = await vectorLock(root, signal);
  try {
    // Respect productions started from the original Studio/terminal, too.
    for (;;) {
      signal?.throwIfAborted();
      const owner = read(
        path.join(root, ".cache/video-pipeline/pipeline.lock"),
      );
      if (!owner || !Number.isSafeInteger(owner.pid) || !alive(owner.pid))
        break;
      live("Menunggu pipeline Video Vektor yang sedang berjalan…");
      await delay(500, undefined, { signal });
    }
    live("Video Vektor: menyiapkan naskah dan animasi…");
    await (options.run ?? runPipeline)(request, root, signal);
    signal?.throwIfAborted();
    for (const name of VECTOR_FILES) {
      const file = path.join(request.output, name);
      if (
        !existsSync(file) ||
        !lstatSync(file).isFile() ||
        lstatSync(file).isSymbolicLink()
      )
        throw Error(`Hasil Video Vektor belum lengkap: ${name}`);
    }
    const spec = await (options.probe ?? probeVector)(
      path.join(request.output, "video.mp4"),
      signal,
    );
    signal?.throwIfAborted();
    const dest = path.join(
      chapterDir(c),
      `video-vektor-r${j.revision}-j${j.id}`,
    );
    mkdirSync(dest, { recursive: true, mode: 0o700 });
    const artifacts: Record<string, string> = {};
    for (const name of VECTOR_FILES) {
      copyFileSync(path.join(request.output, name), path.join(dest, name));
      artifacts[name] = path
        .relative(ROOT, path.join(dest, name))
        .split(path.sep)
        .join("/");
    }
    return {
      ...spec,
      file: artifacts["video.mp4"],
      mode: "video-vektor",
      source: "VIDEO_VEKTOR",
      projectId: request.id,
      artifacts,
      renderedAt: new Date().toISOString(),
    };
  } finally {
    release();
  }
}
