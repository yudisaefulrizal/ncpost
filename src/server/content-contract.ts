import { quoteText } from "./quote-text";
export type ArticleConfig = {
  source: "knowledge" | "manual" | "web";
  topicMode: "manual" | "ai";
  context: string;
  topic: string;
  material: string;
  paragraphCount: number | null;
};
export type ImageUnit = "article" | "paragraph" | "sentence";
export function normalizeArticleConfig(value: any): ArticleConfig {
  if (
    !value ||
    !["knowledge", "manual", "web"].includes(value.source) ||
    !["manual", "ai"].includes(value.topicMode)
  )
    throw Error("Pengaturan bahan artikel tidak valid");
  const string = (key: string) => {
    const text = value[key] ?? "";
    if (typeof text !== "string" || text.length > 100000)
      throw Error("Input artikel tidak valid");
    return text.trim();
  };
  const count = value.paragraphCount ?? null;
  if (
    count !== null &&
    (!Number.isSafeInteger(count) || count < 1 || count > 100)
  )
    throw Error("Jumlah paragraf harus bilangan bulat 1–100 atau kosong");
  return {
    source: value.source,
    topicMode: value.topicMode,
    context: string("context"),
    topic: string("topic"),
    material: string("material"),
    paragraphCount: count,
  };
}
export const ARTICLE_VARIABLES = {
  konteks: "Konteks utama",
  topik: "Bahasan spesifik",
  jumlah_paragraf: "Jumlah paragraf",
  bahan: "Bahan manual",
  buku: "Alias konteks",
  bab: "Alias topik",
};
export const IMAGE_VARIABLES = {
  konteks: "Konteks utama",
  topik: "Bahasan spesifik",
  judul: "Judul artikel",
  heading: "Heading artikel",
  artikel: "Seluruh paragraf isi",
  paragraf: "Paragraf yang diproses",
  kalimat: "Kalimat yang diproses",
  sumber: "Sumber",
  tag: "Tag",
  nomor_unit: "Nomor unit (mulai 1)",
  total_unit: "Jumlah unit",
  quote: "Isi Quote",
  teks: "Alias isi unit (prompt lama)",
  buku: "Alias konteks",
  bab: "Alias topik",
};
export function fillVariables(
  prompt: string,
  variables: Record<string, string>,
) {
  return prompt.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in variables))
      throw Error(`Placeholder {{${key}}} tidak dikenal`);
    return variables[key];
  });
}
export function splitSentences(text: string) {
  return text
    .replace(/[*_`]/g, "")
    .trim()
    .split(/(?<=[.!?])\s+|(?<=[.!?]["'”’)])\s+/)
    .filter(Boolean);
}
export function articleData(raw: string, quote = false) {
  const normalized = raw.replace(/\r\n/g, "\n").trim();
  if (quote)
    return {
      title: "",
      heading: "",
      paragraphs: normalized ? [normalized] : [],
      source: "",
      tags: [] as string[],
    };
  const lines = normalized.split("\n");
  const title = (lines.shift() || "").replace(/^#\s*/, "").trim();
  const headings = lines.filter((line) => /^##\s/.test(line));
  const sourceAt = lines.findIndex((line) =>
    /^(Sumber:|Berdasarkan buku )/.test(line),
  );
  const tagAt = lines.findIndex((line) => /^Tag:/.test(line));
  const end = Math.min(
    ...[sourceAt, tagAt, lines.length].filter((i) => i >= 0),
  );
  const paragraphs = lines
    .slice(0, end)
    .filter((line) => !/^##\s/.test(line))
    .join("\n")
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const source =
    sourceAt < 0
      ? ""
      : lines
          .slice(sourceAt, tagAt > sourceAt ? tagAt : lines.length)
          .join("\n")
          .replace(/^Sumber:\s*/, "")
          .replace(/^Berdasarkan buku /, "")
          .trim();
  const tags =
    tagAt < 0
      ? []
      : lines[tagAt]
          .slice(4)
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
  return {
    title,
    heading: (headings[0] || "").replace(/^##\s*/, "").trim(),
    paragraphs,
    source,
    tags,
  };
}
export function validateUnifiedArticle(
  raw: string,
  count: number | null = null,
  quote = false,
) {
  const data = articleData(raw, quote),
    errors: string[] = [];
  if (quote) {
    try {
      quoteText(raw);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  if (!quote && (!data.title || !/^# [^\n]+/.test(raw.trim())))
    errors.push("Judul wajib di awal dengan format # Judul");
  if (!data.paragraphs.length) errors.push("Isi artikel wajib diisi");
  if (count !== null && data.paragraphs.length !== count)
    errors.push(`Isi wajib ${count} paragraf`);
  if (!quote && raw.split("\n").filter((line) => /^##\s/.test(line)).length > 1)
    errors.push("Artikel hanya memiliki satu heading");
  if (data.paragraphs.some((p) => /(^|\n)#+\s/.test(p)))
    errors.push("Heading harus terpisah dari isi");
  return {
    ...data,
    ok: !errors.length,
    errors,
    attribution: data.source ? `Sumber: ${data.source}` : "",
    counts: data.paragraphs.map((p) => p.split(/\s+/).length),
  };
}
export function mediaUnits(raw: string, unit: ImageUnit, quote = false) {
  const data = articleData(raw, quote);
  const entries =
    unit === "article"
      ? [{ text: data.paragraphs.join("\n\n"), paragraph: 0 }]
      : unit === "paragraph"
        ? data.paragraphs.map((text, i) => ({ text, paragraph: i + 1 }))
        : data.paragraphs.flatMap((p, i) =>
            splitSentences(p).map((text) => ({ text, paragraph: i + 1 })),
          );
  return entries.map((entry, i) => ({
    ...entry,
    index: i + 1,
    total: entries.length,
  }));
}
export function imageVariables(
  raw: string,
  unit: ImageUnit,
  index: number,
  quote = false,
  context = "",
  topic = "",
) {
  const data = articleData(raw, quote),
    units = mediaUnits(raw, unit, quote),
    entry = units[index];
  if (!entry) throw Error("Unit gambar tidak ditemukan");
  return {
    judul: data.title,
    heading: data.heading,
    artikel: data.paragraphs.join("\n\n"),
    paragraf: unit === "paragraph" ? entry.text : "",
    kalimat: unit === "sentence" ? entry.text : "",
    sumber: data.source,
    tag: data.tags.join(", "),
    nomor_unit: String(entry.index),
    total_unit: String(entry.total),
    quote: quote ? entry.text : "",
    teks: entry.text,
    konteks: context,
    topik: topic,
    buku: context,
    bab: topic,
  };
}
export function articleVariables(
  config: ArticleConfig,
  context = config.context,
  topic = config.topic,
) {
  return {
    konteks: context,
    topik: topic,
    jumlah_paragraf:
      config.paragraphCount === null ? "" : String(config.paragraphCount),
    bahan: config.material,
    buku: context,
    bab: topic,
  };
}

export function configuredArticlePrompt(
  template: string,
  config: ArticleConfig,
  quote = false,
  context = config.context,
  topic = config.topic,
) {
  const effectiveTopic = config.topicMode === "manual" ? topic : "";
  if (config.source === "manual" && !config.material)
    throw Error("Bahan manual wajib diisi");
  if (config.topicMode === "manual" && !effectiveTopic)
    throw Error("Topik manual wajib diisi");
  const content = fillVariables(
    template,
    articleVariables(config, context, effectiveTopic),
  );
  const contract = quote
    ? "Hasil hanya satu paragraf isi tanpa judul atau metadata."
    : `Hasil: # Judul, satu ## Heading bila relevan, paragraf isi dipisahkan baris kosong, Sumber: keterangan sumber bila tersedia, lalu Tag: tag dipisahkan koma bila tersedia.${config.paragraphCount !== null ? ` Jumlah isi tepat ${config.paragraphCount} paragraf.` : " Jumlah paragraf mengikuti prompt."}`;
  const source =
    config.source === "web"
      ? "Gunakan tool pencarian web dan periksa sumbernya."
      : config.source === "manual"
        ? `Gunakan bahan manual berikut:\n${config.material}`
        : "Gunakan pengetahuan model; jangan melakukan pencarian web.";
  return `${content}\n\nInput produksi:\nKonteks: ${context}\nTopik: ${effectiveTopic || "Tentukan sendiri sesuai prompt"}\n${source}\n\nKontrak struktur hasil:\n${contract}`;
}
