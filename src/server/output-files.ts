// Hapus berkas hasil render yang dirujuk manifest (video, panel, gambar)
// ketika kontennya dihapus. Hanya berkas di dalam folder output.
import { lstat, rm } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./config";
import { manifestFiles, type CleanKind } from "./cleanup-domain";
import { outputRoot } from "./output-paths";

export type ResultFile = {
  kind: CleanKind;
  raw: unknown;
  /** Lokasi berkas di disk dari nama di manifest. */
  locate: (file: string) => string;
};
export async function removeResultFiles(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  results: ResultFile[],
) {
  const root = path.resolve(outputRoot()) + path.sep;
  for (const { kind, raw, locate } of results)
    for (const file of manifestFiles(kind, raw)) {
      const resolved = path.resolve(locate(file));
      if (!resolved.startsWith(root)) continue;
      try {
        if (!(await lstat(resolved)).isFile()) continue;
        await rm(resolved, { force: true });
        await db.query("DELETE FROM media_stock WHERE file=?", [
          path.relative(ROOT, resolved),
        ]);
      } catch {
        // Berkas sudah hilang atau tidak bisa dihapus; konten tetap terhapus.
      }
    }
}
