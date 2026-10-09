import type { ProductionLabPrompt } from "../server/lab-production";
import {
  mkdirSync,
  copyFileSync,
  rmSync,
  constants as fsConstants,
} from "node:fs";
import path from "node:path";
import { ROOT } from "../server/config";
import type { Store } from "../server/store";
import { generateCodexImage } from "../server/codex-image";
import { stockPrompt } from "../server/prompts";
import { isHorizontalKind } from "../server/book-settings";
import { stripMarkdownEmphasis } from "../server/stock-prompts";
import { slugify } from "../server/stock-match";
export async function generateStock(
  store: Pick<Store, "addAsset">,
  kind: string,
  heading: string,
  paragraph: string,
  work: string,
  panel: number,
  lab?: ProductionLabPrompt | null,
) {
  const prompt = lab
    ? `${lab.prompt}\n\nOrientasi gambar: ${isHorizontalKind(kind) ? "horizontal 16:9" : "vertikal 9:16"}.`
    : stockPrompt(kind, heading, paragraph);
  const tmp = path.join(work, `stock-panel-${panel}.jpg`);
  let failure = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await generateCodexImage(
        prompt,
        work,
        tmp,
        isHorizontalKind(kind) ? "horizontal" : "vertikal",
        ...(lab ? ([lab.images] as [string[]]) : []),
      );
      failure = "";
      break;
    } catch (e) {
      failure = (e as Error).message;
    }
  }
  if (failure)
    throw Error(`Panel ${panel} gagal setelah 3 percobaan: ${failure}`);
  // Nama dan deskripsi gambar = teks heading panel.
  const description = stripMarkdownEmphasis(heading);
  const pool = path.join(ROOT, "output/stock", kind);
  mkdirSync(pool, { recursive: true, mode: 0o700 });
  const slug = slugify(description);
  // Job paralel bisa memakai slug yang sama: salin dengan COPYFILE_EXCL dan
  // daftarkan; bila nama sudah terpakai, coba akhiran berikutnya.
  for (let n = 1; ; n++) {
    const file = path.join(pool, n === 1 ? `${slug}.jpg` : `${slug}-${n}.jpg`);
    try {
      copyFileSync(tmp, file, fsConstants.COPYFILE_EXCL);
    } catch (e) {
      if ((e as { code?: string }).code === "EEXIST") continue;
      throw e;
    }
    try {
      const id = await store.addAsset(
        kind,
        path.relative(ROOT, file),
        description,
        prompt,
      );
      rmSync(tmp, { force: true });
      return id;
    } catch (e) {
      rmSync(file, { force: true });
      if ((e as { code?: string }).code !== "ER_DUP_ENTRY") throw e;
    }
  }
}
