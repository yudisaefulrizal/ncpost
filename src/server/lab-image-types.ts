import { labConfig } from "./lab-config";
export type LabImageType = {
  kind: string;
  name: string;
  imageType?: "illustration" | "ready_post" | "ready_video";
  usage?: "single" | "carousel" | "video";
  orientation: "horizontal" | "vertikal" | "bebas";
};
export type LabImageCatalog = { stock: LabImageType[]; quote: LabImageType[] };
export function labImageKind(value: unknown) {
  if (typeof value !== "string") return null;
  const match = /^(?:S_)?IMAGE_LAB_([1-9]\d{0,9})_([HV])$/.exec(value);
  const quote = /^QUOTE_LAB_([1-9]\d{0,9})$/.exec(value);
  const id = Number(match?.[1] || quote?.[1]);
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) return null;
  return {
    id,
    quote: !!quote,
    orientation: match
      ? match[2] === "H"
        ? "horizontal"
        : "vertikal"
      : "bebas",
  } as const;
}
export function labImageCatalog(
  rows: {
    id: number;
    name: string;
    reference_key?: string | null;
    image_type?: string;
    config?: string | null;
  }[],
): LabImageCatalog {
  const stock: LabImageType[] = [],
    quote: LabImageType[] = [];
  for (const row of rows) {
    const imageType: NonNullable<LabImageType["imageType"]> =
      row.image_type === "ready_video"
        ? "ready_video"
        : row.image_type === "ready_post"
          ? "ready_post"
          : "illustration";
    const config = labConfig(row.config);
    const typeMetadata = {
      ...(row.image_type ? { imageType } : {}),
      ...(config?.usage ? { usage: config.usage } : {}),
    };
    const key = row.reference_key || "";
    const stockOnly = key.startsWith("IMAGE_");
    const horizontal = [
      "IMAGE_HORIZONTAL",
      "IMAGE_PAPERCUT_HORIZONTAL",
    ].includes(key);
    {
      if (!stockOnly || horizontal)
        stock.push({
          ...typeMetadata,
          kind: `IMAGE_LAB_${row.id}_H`,
          name: `${row.name} · horizontal`,
          orientation: "horizontal",
        });
      if (!stockOnly || !horizontal)
        stock.push({
          ...typeMetadata,
          kind: `IMAGE_LAB_${row.id}_V`,
          name: `${row.name} · vertikal`,
          orientation: "vertikal",
        });
    }
    quote.push({
      ...typeMetadata,
      kind: `QUOTE_LAB_${row.id}`,
      name: row.name,
      orientation: "bebas",
    });
  }
  return { stock, quote };
}
