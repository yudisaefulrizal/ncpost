import { sharedMedia } from "../server/media-stock";
import sharp from "sharp";
import type { ProductionLabPrompt } from "../server/lab-production";
import { generateCodexImage } from "../server/codex-image";
import { type ChapterRef } from "../server/output-paths";
export function wholeTextImagePrompt(text: string) {
  if (!text.trim()) throw Error("Teks artikel wajib diisi");
  return `buat menjadi infografis\n\n${text.trim()}`;
}
export async function generateWholeTextImage(
  chapter: ChapterRef,
  article: string,
  work: string,
  revision: number,
  jobId: number,
  generate = generateCodexImage,
  lab?: ProductionLabPrompt | null,
  force = false,
) {
  const prompt = lab?.prompt || wholeTextImagePrompt(article);
  const file = await sharedMedia({
    category: "image",
    identity: [lab?.name || (lab ? `lab-${lab.id}` : "infografis"), "bebas"],
    text: article,
    presetId: lab?.id,
    prompt,
    force,
    generate: (temporary) =>
      generate(
        prompt,
        work,
        temporary,
        "bebas",
        ...(lab ? ([lab.images] as [string[]]) : []),
      ),
  });
  const meta = await sharp(file).metadata();
  return {
    file,
    prompt,
    width: meta.width,
    height: meta.height,
    renderedAt: new Date().toISOString(),
  };
}
