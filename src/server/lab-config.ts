import {
  configuredArticlePrompt,
  fillVariables,
  imageVariables,
  normalizeArticleConfig,
  type ArticleConfig,
  type ImageUnit,
} from "./content-contract";
export type LabConfig = {
  usage?: "single" | "carousel" | "video";
  promptNext?: string;
  unit?: ImageUnit;
  sampleArticle?: string;
  sampleQuote?: boolean;
  sampleContext?: string;
  sampleTopic?: string;
  testIndex?: number;
  article?: ArticleConfig;
};
export function labConfig(raw: unknown): LabConfig | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const value: any = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value))
    throw Error("Konfigurasi Lab tidak valid");
  if (
    value.usage !== undefined &&
    !["single", "carousel", "video"].includes(value.usage)
  )
    throw Error("Penggunaan gambar tidak valid");
  if (
    value.unit !== undefined &&
    !["article", "paragraph", "sentence"].includes(value.unit)
  )
    throw Error("Unit gambar tidak valid");
  for (const key of [
    "promptNext",
    "sampleArticle",
    "sampleContext",
    "sampleTopic",
  ])
    if (
      value[key] !== undefined &&
      (typeof value[key] !== "string" || value[key].length > 100000)
    )
      throw Error("Input Lab tidak valid");
  if (value.sampleQuote !== undefined && typeof value.sampleQuote !== "boolean")
    throw Error("Jenis artikel contoh tidak valid");
  if (
    value.testIndex !== undefined &&
    (!Number.isSafeInteger(value.testIndex) || value.testIndex < 1)
  )
    throw Error("Nomor unit uji tidak valid");
  return {
    ...value,
    ...(value.article
      ? { article: normalizeArticleConfig(value.article) }
      : {}),
  };
}
export function labTestPrompt(
  kind: string,
  prompt: string,
  config: LabConfig,
  quote = false,
) {
  if (kind === "image") {
    if (!config.sampleArticle?.trim())
      throw Error("Pilih artikel contoh untuk uji gambar");
    const index = (config.testIndex || 1) - 1;
    const template =
      config.usage === "carousel" && index > 0
        ? config.promptNext || prompt
        : prompt;
    return fillVariables(
      template,
      imageVariables(
        config.sampleArticle,
        config.usage === "single"
          ? "article"
          : config.unit ||
              (config.usage === "video" ? "sentence" : "paragraph"),
        index,
        config.sampleQuote,
        config.sampleContext || "",
        config.sampleTopic || "",
      ),
    );
  }
  if (config.article)
    return configuredArticlePrompt(prompt, config.article, quote);
  return prompt;
}
