import { fillVariables } from "../server/content-contract";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import type { ProductionLabPrompt } from "../server/lab-production";
import { generateCodexImage } from "../server/codex-image";
import { stockPrompt } from "../server/prompts";
import { renderSinglePost } from "../server/render";

export function readyPostPrompt(
  style: string,
  title: string,
  text: string,
  index = 1,
  total = 1,
  context = "",
) {
  return `${style}\n\nInstruksi hasil akhir ini menggantikan aturan gambar ilustrasi tanpa teks: buat gambar final siap posting, termasuk teks dan desain. ${total > 1 ? "Ukuran 1080 × 1350, rasio 4:5." : "Gunakan rasio sesuai prompt gaya; tidak ada rasio tambahan yang dipaksakan."} Sisakan margin aman; seluruh teks harus terbaca dan tidak terpotong. Ikuti gaya, referensi, dan logo dari prompt/lampiran; jangan menambahkan logo yang tidak diberikan.\n${total > 1 ? `Slide ${index} dari ${total}. Pertahankan gaya, warna, tipografi dan identitas yang sama di semua slide.\n` : ""}Judul: ${title}\n${total > 1 ? "Teks yang wajib ditampilkan pada slide ini" : "Bahan konten: ringkas menjadi teks visual yang akurat dan mudah dibaca"}:\n${text}\n${context ? `\nKonteks seluruh carousel, bukan teks untuk disalin seluruhnya pada slide ini:\n${context}` : ""}`;
}
export async function generateReadyPost({
  file,
  work,
  title,
  text,
  style,
  lab,
  index,
  total,
  context,
  generate = generateCodexImage,
}: {
  file: string;
  work: string;
  title: string;
  text: string;
  style?: string;
  lab?: ProductionLabPrompt | null;
  index?: number;
  total?: number;
  context?: string;
  generate?: typeof generateCodexImage;
}) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const prompt = lab?.config
    ? lab.prompt
    : (total ?? 1) === 1
      ? lab?.prompt || style || text
      : readyPostPrompt(
          lab?.prompt ||
            style ||
            "Desain editorial yang rapi dan mudah dibaca.",
          title,
          text,
          index,
          total,
          context,
        );
  const raw = path.join(work, `${path.basename(file)}.original.jpg`);
  await generate(
    prompt,
    work,
    raw,
    "bebas",
    ...(lab ? ([lab.images] as [string[]]) : []),
  );
  // Only carousel slides share a fixed canvas; single images keep their native size.
  const image = sharp(raw).rotate();
  if (!lab?.config && (total ?? 1) > 1)
    image.resize(1080, 1350, { fit: "contain", background: "#ffffff" });
  const meta = await image
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toFile(file);
  return {
    file,
    prompt,
    width: meta.width,
    height: meta.height,
    mode: "direct",
    renderedAt: new Date().toISOString(),
  };
}
export async function generateDirectCarousel({
  dir,
  work,
  title,
  paragraphs,
  footer,
  kind,
  labFor,
  generate = generateCodexImage,
  filePrefix = "",
  variables,
}: {
  variables?: (index: number) => Record<string, string>;
  filePrefix?: string;
  dir: string;
  work: string;
  title: string;
  paragraphs: string[];
  footer: string;
  kind: string;
  labFor: (kind: string, text: string) => Promise<ProductionLabPrompt | null>;
  generate?: typeof generateCodexImage;
}) {
  if (!paragraphs.length) throw Error("Carousel membutuhkan teks");
  let texts = [
    ...paragraphs,
    `Simpan postingan ini untuk dibaca kembali.\n${footer}`,
  ];
  const panels: { file: string; template: string }[] = [];
  let closing = "";
  // Freeze Lab style and immutable attachments once for the whole carousel.
  const marker = `__NCPOST_SLIDE_${randomUUID()}__`;
  const snapshot = await labFor(kind, marker);
  if (snapshot?.config) texts = paragraphs;
  for (const [i, text] of texts.entries()) {
    const file = path.join(
      dir,
      `${filePrefix}${String(i + 1).padStart(2, "0")}-${i === texts.length - 1 ? "slide-penutup" : "panel"}.jpg`,
    );
    const lab = snapshot
      ? {
          ...snapshot,
          prompt:
            snapshot.config && variables
              ? fillVariables(
                  i === 0
                    ? snapshot.rawPrompt || snapshot.prompt
                    : snapshot.config.promptNext ||
                        snapshot.rawPrompt ||
                        snapshot.prompt,
                  variables(i),
                )
              : snapshot.prompt.split(marker).join(text),
          images: [...snapshot.images],
        }
      : null;
    await generateReadyPost({
      file,
      work,
      title,
      text,
      lab,
      style: lab ? undefined : stockPrompt(kind, title, text),
      index: i + 1,
      total: texts.length,
      context: paragraphs.join("\n\n"),
      generate,
    });
    if (!snapshot?.config && i === texts.length - 1) closing = file;
    else panels.push({ file, template: "direct" });
  }
  return {
    panels,
    closing,
    footer,
    mode: "direct",
    renderedAt: new Date().toISOString(),
  };
}
export async function generateTemplatePost({
  file,
  work,
  title,
  text,
  footer,
  kind,
  lab,
  generate = generateCodexImage,
}: {
  file: string;
  work: string;
  title: string;
  text: string;
  footer: string;
  kind: string;
  lab?: ProductionLabPrompt | null;
  generate?: typeof generateCodexImage;
}) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const prompt = `${lab?.prompt || stockPrompt(kind, title, text)}\n\nBuat hanya ilustrasi untuk latar konten. Jangan menambahkan teks, judul, atau huruf; teks ditambahkan melalui template.`;
  const raw = path.join(work, `${path.basename(file)}.background.jpg`);
  await generate(
    prompt,
    work,
    raw,
    "horizontal",
    ...(lab ? ([lab.images] as [string[]]) : []),
  );
  writeFileSync(file, await renderSinglePost(title, text, footer, raw));
  return {
    file,
    prompt,
    width: 1080,
    height: 1350,
    mode: "template",
    renderedAt: new Date().toISOString(),
  };
}
