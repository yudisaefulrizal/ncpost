import { labConfig } from "./lab-config";
import { fillVariables } from "./content-contract";
import { standaloneQuotePrompt } from "./quote-text";
import { labImageKind, labImageCatalog } from "./lab-image-types";
import type mysql from "mysql2/promise";
import type { BookSettings } from "./book-settings";
import { labAttachments, labImageFile } from "./lab-images";
import { fillPrompt, stockPrompt } from "./prompts";
export type ProductionPromptTarget =
  | "book"
  | "news"
  | "POST_IMAGE"
  | "QUOTE_IMAGE"
  | string;
export type ProductionLabPrompt = {
  id: number;
  prompt: string;
  images: string[];
  config?: import("./lab-config").LabConfig;
  rawPrompt?: string;
  imageType?: "ready_video";
};
type SavedPrompt = {
  config?: string | null;
  image_type?: string;
  id: number;
  kind: string;
  prompt: string;
  reference_key: string | null;
  reference_images?: string | null;
  reference_image?: string | null;
  logo_image?: string | null;
};
export async function validateLabSettings(
  db: Pick<mysql.Pool, "query">,
  settings: BookSettings,
  engine?: string,
) {
  const sources = [
    ...settings.stockKinds,
    ...settings.sentenceKinds,
    settings.panelHorizontal,
    settings.panelVertical,
    settings.sentenceVideoKind,
    settings.sentenceVideoHKind,
    settings.quoteImageStyle,
    settings.wholeTextImageKind,
  ].filter((key): key is string => !!key && !!labImageKind(key));
  const ids = [
    ...new Set([
      ...(settings.labPromptIds || []),
      ...sources.map((key) => labImageKind(key)!.id),
    ]),
  ];
  if (!ids.length) return;
  const [rows]: any = await db.query(
    "SELECT id,name,kind,prompt,reference_key,image_type,config FROM lab_prompts WHERE id IN (?)",
    [ids],
  );
  if (rows.length !== ids.length) throw Error("Prompt Lab tidak ditemukan");
  if (engine === "quote") {
    for (const row of rows.filter((row: SavedPrompt) => row.kind === "quote"))
      standaloneQuotePrompt(row.prompt);
  }
  const illustrationIds = new Set(
    [...settings.stockKinds, ...settings.sentenceKinds]
      .map((kind) => labImageKind(kind)?.id)
      .filter(Boolean),
  );
  if (
    rows.some(
      (row: any) =>
        !labConfig(row.config) &&
        row.image_type === "ready_post" &&
        illustrationIds.has(row.id),
    )
  )
    throw Error(
      "Gambar siap posting tidak dapat menjadi sumber ilustrasi video atau template",
    );
  const nonVideoIds = new Set(
    [
      ...settings.stockKinds,
      settings.panelHorizontal,
      settings.panelVertical,
      settings.wholeTextImageKind,
      settings.quoteImageStyle,
    ]
      .map((kind) => labImageKind(kind)?.id)
      .filter(Boolean),
  );
  if (
    rows.some(
      (row: any) =>
        !labConfig(row.config) &&
        row.image_type === "ready_video" &&
        nonVideoIds.has(row.id),
    )
  )
    throw Error(
      "Gambar siap jadi video hanya dapat digunakan sebagai sumber gambar video",
    );
  const catalog = labImageCatalog(
    rows.filter((row: SavedPrompt) => row.kind === "image"),
  );
  const allowed = new Set(
    [...catalog.stock, ...catalog.quote].map((type) => type.kind),
  );
  if (sources.some((source) => !allowed.has(source)))
    throw Error("Jenis gambar Lab tidak sesuai sumber yang dipilih");

  if (
    engine &&
    rows.some(
      (row: SavedPrompt) =>
        row.kind === "article" &&
        row.reference_key !== "quote" &&
        row.reference_key &&
        row.reference_key !== engine,
    )
  )
    throw Error("Prompt artikel tidak sesuai sumber konten");
}
export function selectLabPrompt(
  rows: SavedPrompt[],
  target: ProductionPromptTarget,
  random = Math.random,
) {
  const article = target === "book" || target === "news";
  const candidates = rows.filter((row) => {
    if (target === "QUOTE")
      return (
        row.kind === "quote" ||
        (row.kind === "article" && row.reference_key === "quote")
      );
    if (article)
      return (
        row.kind === "article" &&
        row.reference_key !== "quote" &&
        (!row.reference_key || row.reference_key === target)
      );
    if (row.kind !== "image") return false;
    if (!row.reference_key) return true;
    if (target === "QUOTE_IMAGE") return row.reference_key.startsWith("QUOTE_");
    if (target === "POST_IMAGE") return row.reference_key.startsWith("IMAGE_");
    return row.reference_key === target;
  });
  if (!candidates.length) return null;
  return candidates[
    Math.min(
      candidates.length - 1,
      Math.floor(Math.max(0, random()) * candidates.length),
    )
  ];
}
export function productionLabText(
  row: SavedPrompt,
  target: ProductionPromptTarget,
  vars: Record<string, string>,
) {
  const fill = (text: string) =>
    fillVariables(text, {
      ...vars,
      paragraf: vars.paragraf ?? vars.teks ?? "",
      konteks: vars.konteks ?? vars.buku ?? "",
      topik: vars.topik ?? vars.bab ?? "",
    });
  if (
    target === "book" &&
    row.reference_key === "book" &&
    !labConfig(row.config)
  ) {
    return fillPrompt("artikel/tulis.md", {
      buku: vars.buku,
      bab: vars.bab,
      aturan: fill(row.prompt),
    });
  }
  const config = labConfig(row.config);
  const template =
    config?.usage === "carousel" && Number(vars.nomor_unit || 1) > 1
      ? config.promptNext || row.prompt
      : row.prompt;
  const resolved = fill(template);
  if (!config && row.image_type === "ready_video" && labImageKind(target)) {
    const horizontal = labImageKind(target)!.orientation === "horizontal";
    return `${resolved}\n\nBuat gambar final siap jadi video: teks dan desain sudah menyatu dalam gambar. Aturan ini menggantikan instruksi ilustrasi tanpa teks. Rasio ${horizontal ? "16:9, 1920 × 1080" : "9:16, 1080 × 1920"}. Seluruh teks harus terbaca dan tidak terpotong; sisakan margin aman. Gunakan referensi dan logo yang dilampirkan. Teks yang wajib tampil pada gambar:\n${vars.teks || vars.artikel || ""}`;
  }
  if (target === "book")
    return `${resolved}\n\nInput buku: ${vars.buku}; bab: ${vars.bab}.`;
  if (target === "news") return resolved;
  if (config) return resolved;
  // A plain instruction must receive the actual production content as well.
  return /\{\{(?:teks|artikel|quote|paragraf|kalimat|judul|heading)\}\}/.test(
    row.prompt,
  )
    ? resolved
    : `${resolved}\n\n${vars.teks || vars.quote || vars.artikel || ""}`;
}
export async function productionLabPrompt(
  db: Pick<mysql.Pool, "query">,
  settings: BookSettings,
  target: ProductionPromptTarget,
  vars: Record<string, string>,
): Promise<ProductionLabPrompt | null> {
  const custom = labImageKind(target);
  const ids = custom
    ? [custom.id]
    : target === "book" || target === "news" || target === "QUOTE"
      ? settings.labPromptIds || []
      : [];
  if (!ids.length) return null;
  const [rows]: any = await db.query(
    "SELECT * FROM lab_prompts WHERE id IN (?) ORDER BY id",
    [ids],
  );
  const row = custom
    ? rows.find(
        (row: SavedPrompt) => row.id === custom.id && row.kind === "image",
      )
    : selectLabPrompt(rows, target);
  if (custom) {
    if (!row) throw Error("Jenis gambar Lab tidak ditemukan");
    const catalog = labImageCatalog([row]);
    if (
      ![...catalog.stock, ...catalog.quote].some((type) => type.kind === target)
    )
      throw Error("Jenis gambar Lab tidak sesuai sumber yang dipilih");
  }
  if (!row) return null;
  return {
    id: row.id,
    ...(labConfig(row.config)
      ? { config: labConfig(row.config)!, rawPrompt: row.prompt }
      : {}),
    ...(row.image_type === "ready_video"
      ? { imageType: "ready_video" as const }
      : {}),
    prompt: productionLabText(row, target, vars),
    images: await Promise.all(labAttachments(row).map(labImageFile)),
  };
}

// The single image uses the same selected style and static Lab attachments.
export async function wholeTextProductionPrompt(
  db: mysql.Pool,
  settings: BookSettings,
  variables: Record<string, string>,
): Promise<ProductionLabPrompt | null> {
  const kind = settings.wholeTextImageKind;
  if (!kind) return null;
  const lab = await productionLabPrompt(db, settings, kind, variables);
  if (lab) return lab;
  const text = variables.teks || variables.artikel || "";
  return {
    id: 0,
    prompt: `${stockPrompt(kind, variables.bab || "", text)}\n\n${text}`,
    images: [],
  };
}
