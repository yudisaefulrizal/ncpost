import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  closeSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { ROOT, privateEnv } from "./config";
import { VEKTOR_AGENTS, VEKTOR_STYLE_ID, type VektorAgent } from "./book-settings";
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
export const VECTOR_AGENTS = VEKTOR_AGENTS;
export type VectorAgent = VektorAgent;
/** Agen pembuat naskah/kode: pengaturan jenis konten, lalu VIDEO_VEKTOR_AGENT, lalu codex. */
export function vectorAgent(value?: string | null): VectorAgent {
  const agent = (value || process.env.VIDEO_VEKTOR_AGENT || "codex")
    .trim()
    .toLowerCase();
  if (!(VECTOR_AGENTS as readonly string[]).includes(agent))
    throw Error(
      `Agen Video Vektor tidak valid: ${agent}. Pilih ${VECTOR_AGENTS.join(" atau ")}.`,
    );
  return agent as VectorAgent;
}
/** Gaya visual yang lengkap di folder styles/ mesin (nama folder = nama gaya). */
export function vectorStyles(root = vectorRoot()) {
  const dir = path.join(root, "styles");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && VEKTOR_STYLE_ID.test(e.name))
    .filter(
      (e) =>
        existsSync(path.join(dir, e.name, "style.md")) &&
        ["index.ts", "Film.tsx"].every((f) =>
          existsSync(path.join(dir, e.name, "contoh", f)),
        ),
    )
    .map((e) => {
      const text = readFileSync(path.join(dir, e.name, "style.md"), "utf8");
      const description =
        /^---\r?\n[\s\S]*?^deskripsi:\s*(.*)$/m.exec(text)?.[1]?.trim() ?? "";
      return { id: e.name, name: e.name, description };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
export function vectorStyle(value: string | null | undefined, root: string) {
  const id = (value || process.env.VIDEO_VEKTOR_STYLE || "").trim();
  if (!id) return undefined;
  if (!vectorStyles(root).some((style) => style.id === id))
    throw Error(`Gaya Video Vektor tidak ditemukan atau belum lengkap: ${id}`);
  return id;
}
export const vectorRoot = () =>
  path.resolve(ROOT, process.env.VIDEO_VEKTOR_ROOT || "engines/video-vektor");
export function vectorRequest(
  c: Chapter,
  j: Job,
  root = vectorRoot(),
  choice: { agent?: string | null; style?: string | null } = {},
) {
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
    "--agent",
    vectorAgent(choice.agent),
  ];
  const style = vectorStyle(choice.style, root);
  if (style) args.push("--style", style);
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
// All production descendants share this kernel-enforced memory budget.
export function vectorScope(
  scriptArgs: string[],
  env: NodeJS.ProcessEnv,
  cwd = vectorRoot(),
) {
  if (process.platform !== "linux")
    throw Error(
      "Produksi Video Vektor ncpost dengan batas RAM 2 GB memerlukan Linux.",
    );
  const unit = `ncpost-vector-${randomUUID()}.service`;
  const runtime = `/run/user/${process.getuid!()}`;
  const serviceEnv = {
    ...env,
    XDG_RUNTIME_DIR: runtime,
    DBUS_SESSION_BUS_ADDRESS: `unix:path=${runtime}/bus`,
    REMOTION_GL: "swangle",
    NODE_OPTIONS: "--max-old-space-size=768",
    OPENBLAS_NUM_THREADS: "1",
    OMP_NUM_THREADS: "1",
    MKL_NUM_THREADS: "1",
  };
  return {
    unit,
    command: "systemd-run",
    args: [
      "--user",
      "--pipe",
      "--wait",
      "--service-type=exec",
      `--working-directory=${cwd}`,
      "--property=KillMode=control-group",
      "--property=TimeoutStopSec=5s",
      "--quiet",
      "--collect",
      `--unit=${unit}`,
      "--property=MemoryAccounting=yes",
      "--property=MemoryHigh=1700000000",
      "--property=MemoryMax=2000000000",
      "--property=MemorySwapMax=0",
      ...Object.entries(serviceEnv)
        .filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        )
        .map(([key, value]) => `--setenv=${key}=${value}`),
      process.execPath,
      path.join(ROOT, "scripts/video-vektor-limited.mjs"),
      ...scriptArgs,
    ],
    env: serviceEnv,
  };
}

export function runPipeline(
  request: ReturnType<typeof vectorRequest>,
  root: string,
  signal?: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const scope = vectorScope(
      request.args,
      {
        ...privateEnv(),
        CODEX_BIN: process.env.CODEX_EXECUTABLE || "codex",
        CLAUDE_BIN: process.env.CLAUDE_EXECUTABLE || "claude",
        VIDEO_VEKTOR_ROOT: root,
        ...(process.env.CODEX_MODEL
          ? { CODEX_MODEL: process.env.CODEX_MODEL }
          : {}),
        ...(process.env.CLAUDE_MODEL
          ? { CLAUDE_MODEL: process.env.CLAUDE_MODEL }
          : {}),
        ...Object.fromEntries(
          ["TTS_VOICE", "TTS_RATE"]
            .filter((k) => process.env[k])
            .map((k) => [k, process.env[k]!]),
        ),
      },
      root,
    );
    const startedAt = Date.now();
    mkdirSync(request.cache, { recursive: true });
    const resourceLog = path.join(request.cache, "resources.log");
    writeFileSync(resourceLog, `Scope ${scope.unit}\n`);
    const child = spawn(scope.command, scope.args, {
      cwd: root,
      shell: false,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: scope.env,
    });
    const killScope = (sig: "SIGTERM" | "SIGKILL") =>
      new Promise<void>((done) => {
        // cgroups include descendants that create their own process groups.
        execFile(
          "systemctl",
          ["--user", "kill", `--signal=${sig}`, "--kill-who=all", scope.unit],
          { env: scope.env, timeout: 5000 },
          () => done(),
        );
      });
    let resourceLines = "";
    let tail = "",
      force: NodeJS.Timeout | undefined;
    const capture = (b: Buffer) => {
      tail = (tail + b.toString()).slice(-8000);
      const lines = (resourceLines + b.toString()).split(/[\r\n]/);
      resourceLines = lines.pop()!.slice(-8000);
      for (const line of lines)
        if (line.startsWith("Video Vektor: ")) {
          try {
            appendFileSync(resourceLog, line + "\n");
          } catch {
            /* Resource telemetry must not crash the worker. */
          }
        }
    };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    const progress = setInterval(() => {
      const state = read(path.join(request.cache, "status.json"));
      if (
        state?.projectId !== request.id ||
        Date.parse(state.startedAt) < startedAt
      )
        return;
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
      killScope("SIGTERM");
      child.kill("SIGTERM");
      force = setTimeout(() => {
        killScope("SIGKILL");
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
    child.once("close", async (code) => {
      clean();
      // Wait until cleanup has been sent before releasing the production lock.
      await killScope("SIGKILL");
      if (signal?.aborted) reject(signal.reason);
      else if (code !== 0)
        reject(
          Error(
            `Produksi Video Vektor gagal. Batas RAM produksi 2 GB; cek pesan cgroup/OOM jika proses dibunuh. ${tail.trim()}\nJika layanan pengguna systemd belum aktif, lihat README bagian batas RAM Video Vektor.\nLog: ${path.join(request.cache, "production.log")}`,
          ),
        );
      else resolve();
    });
    if (signal?.aborted) abort();
  });
}
/** Prepare the active checkout too: deployments may build in a temporary release. */
export async function prepareVideoVektor(root: string, signal?: AbortSignal) {
  live("Menyiapkan mesin Video Vektor (batas RAM 2 GB)…");
  // Use the same boundary for installers and their subprocesses, too.
  await runPipeline(
    {
      id: "setup",
      args: [path.join(ROOT, "scripts/setup-video-vektor.mjs")],
      output: root,
      cache: path.join(root, ".cache/video-pipeline/setup"),
    },
    root,
    signal,
  );
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
    prepare?: typeof prepareVideoVektor;
    settings?: { vektorAgent?: string; vektorStyle?: string } | null;
  } = {},
) {
  const root = options.root ?? vectorRoot(),
    signal = options.signal ?? generationSignal();
  if (!existsSync(path.join(root, "scripts/video.mjs")))
    throw Error("Sumber mesin Video Vektor tidak ditemukan.");
  const request = vectorRequest(c, j, root, {
      agent: options.settings?.vektorAgent,
      style: options.settings?.vektorStyle,
    }),
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
    await (options.prepare ?? prepareVideoVektor)(root, signal);
    signal?.throwIfAborted();
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
