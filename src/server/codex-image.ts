import path from "node:path";
import { readdir, lstat, realpath, mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
export const STOCK_JPEG = { quality: 88, mozjpeg: true } as const;
// Capability adapter only. A successful agent message alone cannot establish image availability.
export const IMAGE_CLI_ARGS = [
  "exec",
  "--ignore-user-config",
  "--ignore-rules",
  "--ephemeral",
  "--skip-git-repo-check",
  "--json",
  "--sandbox",
  "workspace-write",
  "--enable",
  "image_generation",
  "--disable",
  "unified_exec",
  "--disable",
  "shell_tool",
  "--disable",
  "browser_use",
  "--disable",
  "computer_use",
  "--disable",
  "apps",
];
export async function collectCodexImage(
  events: string,
  opts: {
    home: string;
    output: string;
    startedAt: number;
    orientation:
      | "horizontal"
      | "vertikal"
      | "bebas"
      | "posting"
      | "video-v"
      | "video-h";
  },
) {
  const parsed = events
    .trim()
    .split("\n")
    .map((x) => JSON.parse(x));
  if (
    parsed.some(
      (x) =>
        x.type === "error" ||
        x.type === "turn.failed" ||
        x.item?.type === "error",
    )
  )
    throw Error("CLI image error");
  const thread = parsed.find((x) => x.type === "thread.started")?.thread_id;
  if (typeof thread !== "string" || !/^[-a-f0-9]{36}$/.test(thread))
    throw Error("Thread image tidak valid");
  const root = path.join(opts.home, ".codex/generated_images", thread);
  const actual = await realpath(root);
  if (actual !== root) throw Error("Image directory symlink ditolak");
  const candidates = [];
  for (const name of await readdir(root)) {
    if (!name.endsWith(".png")) continue;
    const file = path.join(root, name),
      st = await lstat(file);
    if (st.isSymbolicLink() || !st.isFile())
      throw Error("Image symlink ditolak");
    if (st.mtimeMs >= opts.startedAt && st.size > 0) candidates.push(file);
  }
  if (candidates.length !== 1)
    throw Error("PNG nyata dan fresh tidak tersedia atau ambigu");
  const meta = await sharp(candidates[0]).metadata();
  if (meta.format !== "png" || !meta.width || !meta.height)
    throw Error("Orientasi stok tidak sesuai");
  // Orientasi bebas (gambar quote): ukuran asli Codex dipertahankan.
  const free = opts.orientation === "bebas";
  const posting = opts.orientation === "posting";
  const video =
    opts.orientation === "video-v" || opts.orientation === "video-h";
  const horizontal =
    opts.orientation === "horizontal" || opts.orientation === "video-h";
  const width = free ? meta.width : horizontal ? 1920 : 1080,
    height = posting ? 1350 : free ? meta.height : horizontal ? 1080 : 1920;
  if (
    !free &&
    !posting &&
    !video &&
    (opts.orientation === "horizontal"
      ? meta.width <= meta.height
      : meta.width >= meta.height)
  )
    throw Error("Orientasi stok tidak sesuai");
  await mkdir(path.dirname(opts.output), { recursive: true });
  // Disimpan sebagai JPEG: PNG 1920×1080 dari Codex ±4 MB, JPEG ±0,4 MB.
  await writeFile(
    opts.output,
    await sharp(candidates[0])
      .resize(
        width,
        height,
        posting || video
          ? { fit: "contain", background: "#ffffff" }
          : { fit: "cover" },
      )
      .jpeg(STOCK_JPEG)
      .toBuffer(),
  );
  return { width, height, thread, output: opts.output };
}

export async function generateCodexImage(
  prompt: string,
  cwd: string,
  output: string,
  orientation:
    | "horizontal"
    | "vertikal"
    | "bebas"
    | "posting"
    | "video-v"
    | "video-h",
  referenceImages: string[] = [],
) {
  const { runCli } = await import("./providers");
  const { codexImagePrompt } = await import("./prompts");
  const startedAt = Date.now();
  const events = await runCli(
    process.env.CODEX_EXECUTABLE || "codex",
    [
      ...IMAGE_CLI_ARGS,
      ...referenceImages.flatMap((file) => ["--image", file]),
      ...(process.env.CODEX_MODEL ? ["--model", process.env.CODEX_MODEL] : []),
      "--",
      "-",
    ],
    // Pembungkus mekanis (prompts/gambar/pembungkus-codex.md); isi prompt literal.
    codexImagePrompt(prompt),
    cwd,
    180000,
  );
  if (!process.env.HOME) throw Error("HOME CLI tidak tersedia");
  return collectCodexImage(events, {
    home: process.env.HOME,
    output,
    startedAt,
    orientation,
  });
}
