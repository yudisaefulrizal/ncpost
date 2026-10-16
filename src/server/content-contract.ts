import { quoteText } from "./quote-text";
export type ArticleConfig = {
  source: "knowledge" | "manual" | "web" | "lab";
  // Sumber = lab: berita diambil dari pilihan Jurnalis di Lab Berita ini.
  labId?: number;
  topicMode: "manual" | "ai";
  context: string;
  topic: string;
  material: string;
  paragraphCount: number | null;
  // Kendali riset saat sumber = web (berita atau konten yang butuh data terbaru).
  research?: WebResearch;
};
export const RESEARCH_RECENCY = {
  "24h": "24 jam terakhir",
  "7d": "7 hari terakhir",
  "30d": "30 hari terakhir",
  any: "bebas",
} as const;
export type WebResearch = {
  recency: keyof typeof RESEARCH_RECENCY;
  region: string;
  language: string;
  preferred: string[];
  excluded: string[];
  minSources: number;
  citeSources: boolean;
  avoidRepeat: boolean;
};
export const DEFAULT_WEB_RESEARCH: WebResearch = {
  recency: "any",
  region: "",
  language: "Indonesia",
  preferred: [],
  excluded: [],
  minSources: 1,
  citeSources: true,
  avoidRepeat: true,
};
/** "https://www.Kompas.com/berita" → "kompas.com"; null bila bukan domain. */
export function normalizeDomain(value: string) {
  const host = value
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#:]/)[0];
  return /^([a-z0-9-]+\.)+[a-z]{2,}$/.test(host) ? host : null;
}
export function normalizeWebResearch(value: any): WebResearch {
  const v = { ...DEFAULT_WEB_RESEARCH, ...(value ?? {}) };
  if (!(v.recency in RESEARCH_RECENCY))
    throw Error("Rentang waktu riset tidak dikenal");
  const text = (x: unknown, max: number) => {
    if (typeof x !== "string" || x.length > max)
      throw Error("Isian riset web tidak valid");
    return x.trim();
  };
  const domains = (list: unknown, label: string) => {
    if (!Array.isArray(list) || list.length > 30)
      throw Error(`${label} maksimal 30 situs`);
    const out: string[] = [];
    for (const item of list) {
      const d = typeof item === "string" ? normalizeDomain(item) : null;
      if (!d)
        throw Error(
          `${label}: "${String(item).slice(0, 60)}" bukan nama situs`,
        );
      if (!out.includes(d)) out.push(d);
    }
    return out;
  };
  if (!Number.isInteger(v.minSources) || v.minSources < 1 || v.minSources > 10)
    throw Error("Jumlah minimal sumber harus 1–10");
  for (const key of ["citeSources", "avoidRepeat"] as const)
    if (typeof v[key] !== "boolean") throw Error("Isian riset web tidak valid");
  const preferred = domains(v.preferred, "Sumber prioritas");
  const excluded = domains(v.excluded, "Sumber dikecualikan");
  if (preferred.some((d) => excluded.includes(d)))
    throw Error(
      "Situs yang sama tidak boleh diprioritaskan sekaligus dikecualikan",
    );
  return {
    recency: v.recency,
    region: text(v.region, 100),
    language: text(v.language, 60),
    preferred,
    excluded,
    minSources: v.minSources,
    citeSources: v.citeSources,
    avoidRepeat: v.avoidRepeat,
  };
}
export type ImageUnit = "article" | "paragraph" | "sentence";
export function normalizeArticleConfig(value: any): ArticleConfig {
  if (
    !value ||
    !["knowledge", "manual", "web", "lab"].includes(value.source) ||
    !["manual", "ai"].includes(value.topicMode)
  )
    throw Error("Pengaturan bahan artikel tidak valid");
  const string = (key: string) => {
    const text = value[key] ?? "";
    if (typeof text !== "string" || text.length > 100000)
      throw Error("Input artikel tidak valid");
    return text.trim();
  };
  if (
    value.source === "lab" &&
    (!Number.isSafeInteger(value.labId) || value.labId < 1)
  )
    throw Error("Pilih Lab Berita sebagai sumber bahan");
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
    ...(value.source === "lab" ? { labId: value.labId } : {}),
    ...(value.research !== undefined && value.research !== null
      ? { research: normalizeWebResearch(value.research) }
      : {}),
  };
}
export const ARTICLE_VARIABLES = {
  konteks: "Konteks utama",
  topik: "Bahasan spesifik",
  jumlah_paragraf: "Jumlah paragraf",
  bahan: "Bahan manual",
  buku: "Alias konteks",
  bab: "Alias topik",
  rentang_waktu: "Riset web: rentang waktu sumber",
  wilayah: "Riset web: wilayah sumber",
  bahasa_sumber: "Riset web: bahasa sumber",
  sumber_prioritas: "Riset web: situs yang didahulukan",
  sumber_dikecualikan: "Riset web: situs yang tidak boleh dipakai",
  minimal_sumber: "Riset web: jumlah minimal sumber per fakta",
  topik_sebelumnya: "Topik yang sudah pernah dibuat (agar tidak berulang)",
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
  previousTopics: string[] = [],
) {
  const research = config.research ?? DEFAULT_WEB_RESEARCH;
  return {
    konteks: context,
    topik: topic,
    jumlah_paragraf:
      config.paragraphCount === null ? "" : String(config.paragraphCount),
    bahan: config.material,
    buku: context,
    bab: topic,
    rentang_waktu: RESEARCH_RECENCY[research.recency],
    wilayah: research.region,
    bahasa_sumber: research.language,
    sumber_prioritas: research.preferred.join(", "),
    sumber_dikecualikan: research.excluded.join(", "),
    minimal_sumber: String(research.minSources),
    topik_sebelumnya: previousTopics.join("; "),
  };
}

/** Ketentuan riset yang ditambahkan ke prompt saat sumber = web. */
export function researchRules(
  research: WebResearch = DEFAULT_WEB_RESEARCH,
  previousTopics: string[] = [],
) {
  const rules = [
    research.recency !== "any" &&
      `Gunakan hanya informasi dan sumber yang terbit dalam ${RESEARCH_RECENCY[research.recency]}.`,
    (research.region || research.language) &&
      `Utamakan sumber${research.region ? ` dari ${research.region}` : ""}${research.language ? ` berbahasa ${research.language}` : ""}.`,
    research.preferred.length > 0 &&
      `Dahulukan situs berikut bila relevan: ${research.preferred.join(", ")}.`,
    research.excluded.length > 0 &&
      `Jangan memakai situs berikut sebagai sumber: ${research.excluded.join(", ")}.`,
    research.minSources > 1 &&
      `Setiap fakta penting harus didukung minimal ${research.minSources} sumber berbeda.`,
    research.citeSources &&
      "Wajib mencantumkan sumber utama pada baris Sumber: (nama media dan URL lengkap).",
    research.avoidRepeat &&
      previousTopics.length > 0 &&
      `Jangan menulis ulang topik yang sudah pernah dibuat: ${previousTopics.join("; ")}.`,
  ].filter(Boolean);
  return rules.length ? `Ketentuan riset web:\n- ${rules.join("\n- ")}` : "";
}

/** Periksa hasil artikel terhadap ketentuan riset yang bisa dicek otomatis. */
export function researchErrors(
  research: WebResearch | undefined,
  source: string,
) {
  if (!research) return [];
  const errors: string[] = [];
  if (research.citeSources && !/https?:\/\//.test(source))
    errors.push("Sumber wajib dicantumkan dengan URL pada baris Sumber:");
  const used = [...source.matchAll(/https?:\/\/[^\s)>\]]+/g)]
    .map((m) => normalizeDomain(m[0]))
    .filter((d): d is string => !!d);
  const banned = used.filter((d) =>
    research.excluded.some((x) => d === x || d.endsWith("." + x)),
  );
  if (banned.length)
    errors.push(
      `Sumber dari situs yang dikecualikan: ${[...new Set(banned)].join(", ")}`,
    );
  return errors;
}

/** Format wajib artikel Lab Berita; selalu ditambahkan backend ke prompt lab. */
export const LAB_NEWS_FORMAT = `Format hasil wajib (Markdown):

\`\`\`markdown
# [Judul yang relevan dan tidak sensasional]

## [Judul yang relevan dan tidak sensasional]

[Paragraf 1]

[Paragraf 2]

[Paragraf ...]

Sumber: [Nama media], [link berita]

Tag: tag pertama, tag kedua, tag ketiga
\`\`\`

- Jumlah paragraf mengikuti prompt.
- Hanya paragraf 1 yang memakai heading (\`## \`), isinya identik dengan judul utama; paragraf berikutnya langsung berupa teks tanpa heading.
- Baris \`Sumber:\` diletakkan setelah seluruh isi; \`Tag:\` diletakkan paling akhir, maksimal lima tag.
- Jangan menaruh atribusi, URL, atau tag di dalam paragraf isi.
- Tampilkan hanya artikel final: judul, heading, paragraf, baris Sumber, lalu Tag. Jangan menampilkan proses berpikir, rencana internal, nama skill, atau komentar teknis.`;

export function configuredArticlePrompt(
  template: string,
  config: ArticleConfig,
  quote = false,
  context = config.context,
  topic = config.topic,
  previousTopics: string[] = [],
) {
  const effectiveTopic = config.topicMode === "manual" ? topic : "";
  if (config.source === "manual" && !config.material)
    throw Error("Bahan manual wajib diisi");
  if (config.topicMode === "manual" && !effectiveTopic)
    throw Error("Topik manual wajib diisi");
  const content = fillVariables(
    template,
    articleVariables(config, context, effectiveTopic, previousTopics),
  );
  const contract = quote
    ? "Hasil hanya satu paragraf isi tanpa judul atau metadata."
    : `Hasil: # Judul, satu ## Heading bila relevan, paragraf isi dipisahkan baris kosong, Sumber: keterangan sumber bila tersedia, lalu Tag: tag dipisahkan koma bila tersedia.${config.paragraphCount !== null ? ` Jumlah isi tepat ${config.paragraphCount} paragraf.` : " Jumlah paragraf mengikuti prompt."}`;
  // Ketentuan riset hanya berlaku bila diaktifkan di Konfigurasi artikel.
  const rules =
    config.source === "web" && config.research
      ? researchRules(config.research, previousTopics)
      : "";
  const source =
    config.source === "web"
      ? `Gunakan tool pencarian web dan periksa sumbernya.${rules ? `\n${rules}` : ""}`
      : config.source === "manual"
        ? `Gunakan bahan manual berikut:\n${config.material}`
        : "Gunakan pengetahuan model; jangan melakukan pencarian web.";
  return `${content}\n\nInput produksi:\nKonteks: ${context}\nTopik: ${effectiveTopic || "Tentukan sendiri sesuai prompt"}\n${source}\n\nKontrak struktur hasil:\n${contract}`;
}
