import { spawn } from "node:child_process";
import { privateEnv } from "./config";
export function runCli(
  executable: string,
  args: string[],
  prompt: string,
  cwd: string,
  timeout = 180000,
  captureStderr = false,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: privateEnv(),
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "",
      settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      err ? reject(err) : resolve(out);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      done(Error("Provider timeout"));
    }, timeout);
    child.stdout.on("data", (b) => {
      out += b.toString();
      if (out.length > 2000000) {
        child.kill("SIGKILL");
        done(Error("Output terlalu besar"));
      }
    });
    child.stderr.on("data", (b) => {
      if (captureStderr && out.length < 20000) out += b.toString();
    });
    child.on("error", () => done(Error("Executable provider tidak tersedia")));
    child.on("close", (code) =>
      done(
        code === 0
          ? undefined
          : Error("Provider gagal; periksa login atau model melalui terminal"),
      ),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
  });
}
export function parseEvents(raw: string) {
  let final = "";
  for (const line of raw.trim().split("\n")) {
    const e = JSON.parse(line);
    if (e.type === "error" || e.type === "turn.failed")
      throw Error("Provider mengembalikan error");
    if (e.type === "item.completed" && e.item?.type === "agent_message")
      final = e.item.text;
  }
  if (!final) throw Error("Final agent_message tidak tersedia");
  return final;
}
export const cliArgs = [
  "exec",
  "--ignore-user-config",
  "--ignore-rules",
  "--ephemeral",
  "--skip-git-repo-check",
  "--json",
  "--sandbox",
  "read-only",
  "-c",
  "features.shell_tool=false",
  "-c",
  "features.apply_patch=false",
  "--disable",
  "unified_exec",
  "--disable",
  "browser_use",
  "--disable",
  "computer_use",
  "--disable",
  "apps",
  "--disable",
  "code_mode_host",
];
export async function codex(prompt: string, cwd: string) {
  const exe = process.env.CODEX_EXECUTABLE || "codex";
  const help = await runCli(exe, ["exec", "--help"], "", cwd, 10000);
  for (const flag of [
    "--ignore-user-config",
    "--ignore-rules",
    "--ephemeral",
    "--json",
    "--sandbox",
  ])
    if (!help.includes(flag)) throw Error("CLI tidak kompatibel");
  return parseEvents(
    await runCli(
      exe,
      [
        ...cliArgs,
        ...(process.env.CODEX_MODEL
          ? ["--model", process.env.CODEX_MODEL]
          : []),
        "-",
      ],
      prompt,
      cwd,
    ),
  );
}
export const reviewChecks = [
  "kesetiaan-gagasan",
  "klaim-spesifik",
  "bahasa-natural",
  "judul-konkret",
  "nilai-penutup",
  "istilah-asli",
];
export function editorReport(input: any) {
  if (
    typeof input?.lolos !== "boolean" ||
    !Array.isArray(input.checks) ||
    reviewChecks.some(
      (id) =>
        !input.checks.some(
          (c: any) =>
            c.id === id &&
            ["lulus", "revisi"].includes(c.status) &&
            typeof c.catatan === "string" &&
            c.catatan.trim().length >= 12,
        ),
    )
  )
    throw Error(
      "Laporan editor tidak lengkap: setiap checklist perlu status dan catatan spesifik",
    );
  if (input.lolos && input.checks.some((c: any) => c.status !== "lulus"))
    throw Error("Keputusan editor bertentangan");
  return input;
}
export async function tts(
  text: string,
  config: { live: boolean; key: string; voice: string },
  request: typeof fetch = fetch,
) {
  if (!config.live) throw Error("LIVE_TTS=false; langganan belum aktif");
  if (!config.key || !config.voice)
    throw Error("ElevenLabs belum dikonfigurasi");
  const res = await request(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.voice)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": config.key, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_v3" }),
    },
  );
  if (!res.ok) throw Error("ElevenLabs gagal");
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw Error("Audio kosong");
  return buf;
}
const NCWA = "https://ncwa.nuscode.id/api/v1/instagram";
export type ReelInput = {
  requestId: string;
  igUserId: string;
  videoUrl: string;
  caption?: string;
};
export function validateReelInput(i: ReelInput) {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(i?.requestId ?? ""))
    throw Error("requestId tidak valid (huruf, angka, . _ -, maks 64)");
  if (!/^\d{1,64}$/.test(i.igUserId ?? "")) throw Error("igUserId tidak valid");
  let url: URL;
  try {
    url = new URL(i.videoUrl);
  } catch {
    throw Error("videoUrl tidak valid");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw Error("videoUrl harus HTTP/HTTPS publik tanpa kredensial");
  if ((i.caption ?? "").length > 2200)
    throw Error("Caption maksimal 2.200 karakter");
}
async function ncwa(path: string, init: RequestInit, request: typeof fetch) {
  const key = process.env.NCWA_API_KEY;
  if (!key) throw Error("NCWA_API_KEY belum diatur");
  const res = await request(`${NCWA}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(60000),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok)
    throw Error(
      `NC-WA HTTP ${res.status}: ${String(data?.error?.message ?? data?.message ?? data?.error ?? "gagal").slice(0, 300)}`,
    );
  return data;
}
// Hanya REELS+videoUrl; tidak ada fallback gambar dan tidak ada retry otomatis
// (status "unknown" berarti cek Instagram manual, jangan buat requestId baru).
export async function publish(input: ReelInput, request: typeof fetch = fetch) {
  validateReelInput(input);
  return ncwa(
    "/posts",
    {
      method: "POST",
      body: JSON.stringify({
        requestId: input.requestId,
        igUserId: input.igUserId,
        mediaType: "REELS",
        videoUrl: input.videoUrl,
        ...(input.caption ? { caption: input.caption } : {}),
      }),
    },
    request,
  );
}
// Carousel panel (2–10 JPEG publik) lewat NC-WA mediaType CAROUSEL.
export async function publishCarousel(
  input: {
    requestId: string;
    igUserId: string;
    imageUrls: string[];
    caption: string;
  },
  request: typeof fetch = fetch,
) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(input.requestId))
    throw Error("requestId tidak valid");
  if (input.imageUrls.length < 2 || input.imageUrls.length > 10)
    throw Error("Carousel berisi 2 sampai 10 gambar");
  return ncwa(
    "/posts",
    {
      method: "POST",
      body: JSON.stringify({ ...input, mediaType: "CAROUSEL" }),
    },
    request,
  );
}
export async function postStatus(
  requestId: string,
  request: typeof fetch = fetch,
) {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(requestId))
    throw Error("requestId tidak valid");
  return ncwa(`/posts/${requestId}`, { method: "GET" }, request);
}
export function normalizeAccounts(data: unknown) {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as any).accounts)
      ? (data as any).accounts
      : null;
  if (!rows) throw Error("Respons akun NC-WA tidak sesuai kontrak");
  return rows
    .map((a: any) => ({
      id: String(a.igUserId ?? a.id ?? ""),
      username: String(a.username ?? ""),
    }))
    .filter((a: any) => a.id && a.username);
}
export async function accounts() {
  const key = process.env.NCWA_API_KEY;
  if (!key)
    return {
      state: "disconnected",
      reason: "NCWA_API_KEY khusus aplikasi belum diatur",
    };
  try {
    const r = await fetch("https://ncwa.nuscode.id/api/v1/instagram/accounts", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return { state: "error", reason: `NC-WA HTTP ${r.status}` };
    const data = await r.json();
    return {
      state: "connected",
      accounts: normalizeAccounts(data),
      reason: "Akun Instagram terhubung",
    };
  } catch {
    return { state: "error", reason: "NC-WA tidak dapat dijangkau" };
  }
}
