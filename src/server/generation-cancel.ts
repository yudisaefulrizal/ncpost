import { AsyncLocalStorage } from "node:async_hooks";
import type { ChildProcess } from "node:child_process";
const context = new AsyncLocalStorage<AbortSignal>();
export const generationSignal = () => context.getStore();
export function checkGeneration() {
  generationSignal()?.throwIfAborted();
}
export function watchGenerationChild(child: ChildProcess) {
  const signal = generationSignal();
  const stop = () => {
    try {
      if (child.pid && process.platform !== "win32")
        process.kill(-child.pid, "SIGKILL");
      else child.kill("SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  };
  signal?.addEventListener("abort", stop, { once: true });
  child.once("close", () => signal?.removeEventListener("abort", stop));
  if (signal?.aborted) stop();
}
export async function cancellableGeneration(
  db: { query: (...args: any[]) => Promise<any> },
  table: string,
  id: number,
  run: () => Promise<void>,
  expectedVersion?: number,
) {
  if (!["jobs", "news_media_jobs", "news_articles", "lab_runs"].includes(table))
    throw Error("Sumber proses tidak valid");
  const controller = new AbortController();
  let checking = false;
  let version: number | undefined = expectedVersion;
  const check = async () => {
    if (checking || controller.signal.aborted) return;
    checking = true;
    try {
      const [rows] = await db.query(
        `SELECT state,cancel_version FROM ${table} WHERE id=?`,
        [id],
      );
      if (version === undefined) version = Number(rows[0]?.cancel_version || 0);
      if (
        !rows[0] ||
        rows[0].state !== "running" ||
        Number(rows[0].cancel_version || 0) !== version
      )
        controller.abort(Error("Generate dibatalkan"));
    } finally {
      checking = false;
    }
  };
  await check();
  if (controller.signal.aborted) return;
  const timer = setInterval(() => {
    void check().catch(() => {});
  }, 1000);
  try {
    await context.run(controller.signal, run);
  } finally {
    clearInterval(timer);
  }
}
