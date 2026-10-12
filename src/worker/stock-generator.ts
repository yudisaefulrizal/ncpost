import { sharedMedia } from "../server/media-stock";
import type { ProductionLabPrompt } from "../server/lab-production";
import path from "node:path";
import { ROOT } from "../server/config";
import type { Store } from "../server/store";
import { generateCodexImage } from "../server/codex-image";
import { stockPrompt } from "../server/prompts";
import { isHorizontalKind } from "../server/book-settings";
import { stripMarkdownEmphasis } from "../server/stock-prompts";
export async function generateStock(
  store: Pick<Store, "addAsset"> & Partial<Pick<Store, "assetByFile">>,
  kind: string,
  heading: string,
  paragraph: string,
  work: string,
  panel: number,
  lab?: ProductionLabPrompt | null,
  force = false,
) {
  const prompt = lab?.config
    ? lab.prompt
    : lab
      ? `${lab.prompt}\n\nOrientasi gambar: ${isHorizontalKind(kind) ? "horizontal 16:9" : "vertikal 9:16"}.`
      : stockPrompt(kind, heading, paragraph);
  const description = stripMarkdownEmphasis(paragraph || heading);
  const file = await sharedMedia({
    category: "image",
    identity: [
      lab?.name || kind,
      isHorizontalKind(kind) ? "horizontal" : "vertikal",
    ],
    text: description,
    presetId: lab?.id,
    prompt,
    force,
    generate: (temporary) =>
      generateCodexImage(
        prompt,
        work,
        temporary,
        lab?.config
          ? "bebas"
          : lab?.imageType === "ready_video"
            ? isHorizontalKind(kind)
              ? "video-h"
              : "video-v"
            : isHorizontalKind(kind)
              ? "horizontal"
              : "vertikal",
        ...(lab ? ([lab.images] as [string[]]) : []),
      ),
  });
  const relative = path.relative(ROOT, file);
  const existing = await store.assetByFile?.(relative);
  if (existing) return existing.id;
  try {
    return await store.addAsset(kind, relative, description, prompt);
  } catch (error) {
    if ((error as { code?: string }).code !== "ER_DUP_ENTRY") throw error;
    const asset = await store.assetByFile?.(relative);
    if (!asset) throw error;
    return asset.id;
  }
}
