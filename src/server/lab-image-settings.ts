import { labConfig } from "./lab-config";
import type mysql from "mysql2/promise";
import type { BookSettings, VideoMode } from "./book-settings";
import { labImageKind } from "./lab-image-types";

export function imageSettingsFromLabels(
  settings: BookSettings,
  rows: { id: number; image_type?: string; config?: string | null }[],
): BookSettings {
  const mode = (
    kind: string | null | undefined,
    fallback: "template" | "direct",
  ) => {
    if (!kind) return fallback;
    const lab = labImageKind(kind);
    return lab &&
      rows.find((row) => row.id === lab.id)?.image_type === "ready_post"
      ? "direct"
      : "template";
  };
  const selected = (kind: string | null | undefined) =>
    labConfig(rows.find((row) => row.id === labImageKind(kind)?.id)?.config);
  const videoMode = (
    kind: string | null | undefined,
    configured: VideoMode | undefined,
  ) => {
    // Animasi 2D tidak memakai gambar, jadi jenis gambar tidak berpengaruh.
    if (configured === "anim2d") return configured;
    const type = rows.find(
      (row) => row.id === labImageKind(kind)?.id,
    )?.image_type;
    return type === "ready_post" || type === "ready_video"
      ? "direct"
      : (configured ?? "template");
  };
  return {
    ...settings,
    ...(settings.imageUnit === undefined &&
    selected(
      settings.sentenceVideoKind ||
        settings.sentenceVideoHKind ||
        settings.panelVertical ||
        settings.panelHorizontal,
    )?.unit
      ? {
          imageUnit: selected(
            settings.sentenceVideoKind ||
              settings.sentenceVideoHKind ||
              settings.panelVertical ||
              settings.panelHorizontal,
          )!.unit,
        }
      : {}),
    carouselMode:
      selected(settings.panelVertical || settings.panelHorizontal)?.usage ===
      "carousel"
        ? "direct"
        : mode(settings.panelVertical || settings.panelHorizontal, "template"),
    singleImageMode: labImageKind(settings.wholeTextImageKind)
      ? "direct"
      : mode(settings.wholeTextImageKind, "direct"),
    sentenceVideoMode: videoMode(
      settings.sentenceVideoKind,
      settings.sentenceVideoMode,
    ),
    sentenceVideoHMode: videoMode(
      settings.sentenceVideoHKind,
      settings.sentenceVideoHMode,
    ),
  };
}
export async function resolveImageSettings(
  db: Pick<mysql.Pool, "query">,
  settings: BookSettings,
) {
  const ids = [
    ...new Set(
      [
        settings.panelVertical,
        settings.panelHorizontal,
        settings.wholeTextImageKind,
        settings.sentenceVideoKind,
        settings.sentenceVideoHKind,
      ]
        .map((kind) => labImageKind(kind)?.id)
        .filter((id): id is number => !!id),
    ),
  ];
  const [rows]: any = ids.length
    ? await db.query(
        "SELECT id,image_type,config FROM lab_prompts WHERE kind='image' AND id IN (?)",
        [ids],
      )
    : [[]];
  return imageSettingsFromLabels(settings, rows);
}
