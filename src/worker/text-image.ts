import path from "node:path";
import { mkdirSync } from "node:fs";
import { generateCodexImage } from "../server/codex-image";
import { chapterDir, type ChapterRef } from "../server/output-paths";
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
) {
  const prompt = wholeTextImagePrompt(article);
  const file = `gambar-teks-r${revision}-j${jobId}.jpg`;
  mkdirSync(chapterDir(chapter), { recursive: true, mode: 0o700 });
  const meta = await generate(
    prompt,
    work,
    path.join(chapterDir(chapter), file),
    "bebas",
  );
  return {
    file,
    prompt,
    width: meta.width,
    height: meta.height,
    renderedAt: new Date().toISOString(),
  };
}
