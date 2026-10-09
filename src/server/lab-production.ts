import type mysql from "mysql2/promise";
import type { BookSettings } from "./book-settings";
import { labAttachments, labImageFile } from "./lab-images";
import { fillPrompt } from "./prompts";
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
};
type SavedPrompt = {
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
  const ids = settings.labPromptIds || [];
  if (!ids.length) return;
  const [rows]: any = await db.query(
    "SELECT id,kind,reference_key FROM lab_prompts WHERE id IN (?)",
    [ids],
  );
  if (rows.length !== ids.length) throw Error("Prompt Lab tidak ditemukan");
  if (
    engine &&
    rows.some(
      (row: SavedPrompt) =>
        row.kind === "article" &&
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
    if (article)
      return (
        row.kind === "article" &&
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
    text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      if (!(key in vars)) throw Error(`Placeholder {{${key}}} tidak dikenal`);
      return vars[key];
    });
  if (target === "book" && row.reference_key === "book") {
    return fillPrompt("artikel/tulis.md", {
      buku: vars.buku,
      bab: vars.bab,
      aturan: fill(row.prompt),
    });
  }
  const resolved = fill(row.prompt);
  if (target === "book")
    return `${resolved}\n\nInput buku: ${vars.buku}; bab: ${vars.bab}.`;
  if (target === "news") return resolved;
  // A plain instruction must receive the actual production content as well.
  return /\{\{(?:teks|artikel|quote)\}\}/.test(row.prompt)
    ? resolved
    : `${resolved}\n\n${vars.teks || vars.quote || vars.artikel || ""}`;
}
export async function productionLabPrompt(
  db: Pick<mysql.Pool, "query">,
  settings: BookSettings,
  target: ProductionPromptTarget,
  vars: Record<string, string>,
): Promise<ProductionLabPrompt | null> {
  const ids = settings.labPromptIds || [];
  if (!ids.length) return null;
  const [rows]: any = await db.query(
    "SELECT * FROM lab_prompts WHERE id IN (?) ORDER BY id",
    [ids],
  );
  const row = selectLabPrompt(rows, target);
  if (!row) return null;
  return {
    id: row.id,
    prompt: productionLabText(row, target, vars),
    images: await Promise.all(labAttachments(row).map(labImageFile)),
  };
}
