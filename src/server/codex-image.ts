import { retryImageGeneration } from "./image-retry";
import { withPresetLock } from "./media-stock";
import { recordImageTiming } from "./image-timing";
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
    .filter((x) => x.trim())
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
  const actual = await realpath(root).catch((error) => {
    if (error.code === "ENOENT")
      throw Error(
        `Hasil gambar belum tersedia: folder thread ${thread} tidak ditemukan`,
      );
    throw error;
  });
  if (actual !== root) throw Error("Image directory symlink ditolak");
  const candidates = [];
  let stale = 0,
    empty = 0;
  for (const name of await readdir(root)) {
    if (!name.endsWith(".png")) continue;
    const file = path.join(root, name),
      st = await lstat(file);
    if (st.isSymbolicLink() || !st.isFile())
      throw Error("Image symlink ditolak");
    if (!st.size) empty++;
    else if (st.mtimeMs < opts.startedAt) stale++;
    else candidates.push(file);
  }
  if (!candidates.length)
    throw Error(
      `Hasil gambar tidak tersedia: 0 PNG baru, ${stale} PNG lama, ${empty} PNG kosong (thread ${thread})`,
    );
  // Final text disambiguates only files already verified in this exact thread.
  // Never use an arbitrary claimed path, or choose a file by newest timestamp.
  const finalText = parsed
    .filter(
      (x) => x.type === "item.completed" && x.item?.type === "agent_message",
    )
    .at(-1)?.item.text;
  const referenced =
    typeof finalText === "string"
      ? candidates.filter(
          (file) =>
            finalText.includes(file) &&
            !/[\w.\/-]/.test(finalText[finalText.indexOf(file) - 1] || "") &&
            !/[\w.\/-]/.test(
              finalText[finalText.indexOf(file) + file.length] || "",
            ),
        )
      : [];
  if (candidates.length > 1 && referenced.length !== 1)
    throw Error(
      `Hasil gambar ambigu: ${candidates.length} PNG baru, jawaban akhir tidak menunjuk satu file valid (thread ${thread})`,
    );
  const source = candidates.length === 1 ? candidates[0] : referenced[0];
  const meta = await sharp(source)
    .metadata()
    .catch(() => {
      throw Error(
        `Hasil gambar rusak atau tidak dapat dibaca (thread ${thread})`,
      );
    });
  if (meta.format !== "png" || !meta.width || !meta.height)
    throw Error(`Hasil gambar bukan PNG valid (thread ${thread})`);
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
    await sharp(source)
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

async function generateCodexImageUnlocked(
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
  const result = await collectCodexImage(events, {
    home: process.env.HOME,
    output,
    startedAt,
    orientation,
  });
  await recordImageTiming(Date.now() - startedAt, orientation).catch(
    (error) => {
      console.error(
        "Pencatatan durasi gambar gagal:",
        (error as Error).message,
      );
    },
  );
  return result;
}

// One shared lock for every image request, including different presets and workers.
// Waiting for the lock is excluded from the per-image duration.
export async function generateCodexImage(
  ...args: Parameters<typeof generateCodexImageUnlocked>
): Promise<Awaited<ReturnType<typeof generateCodexImageUnlocked>>> {
  return withPresetLock("generation", "all-images", () =>
    retryImageGeneration(() => generateCodexImageUnlocked(...args)),
  );
}
