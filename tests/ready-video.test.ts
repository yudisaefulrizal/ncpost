import { expect, it } from "vitest";
import { labInput } from "../src/server/lab";
import { labImageCatalog } from "../src/server/lab-image-types";
import { DEFAULT_BOOK_SETTINGS } from "../src/server/book-settings";
import { imageSettingsFromLabels } from "../src/server/lab-image-settings";
import {
  productionLabText,
  validateLabSettings,
} from "../src/server/lab-production";
it("accepts ready-video labels and derives vertical and horizontal render modes from selected sources", () => {
  expect(
    labInput({
      kind: "image",
      name: "Video",
      prompt: "Desain",
      imageType: "ready_video",
    }).imageType,
  ).toBe("ready_video");
  const catalog = labImageCatalog([
    { id: 2, name: "Video", image_type: "ready_video" },
  ]);
  expect(catalog.stock).toHaveLength(2);
  expect(
    catalog.stock.every((style) => style.imageType === "ready_video"),
  ).toBe(true);
  expect(
    imageSettingsFromLabels(
      {
        ...DEFAULT_BOOK_SETTINGS,
        sentenceVideoKind: "IMAGE_LAB_2_V",
        sentenceVideoHKind: "IMAGE_LAB_3_H",
      },
      [
        { id: 2, image_type: "ready_video" },
        { id: 3, image_type: "illustration" },
      ],
    ),
  ).toMatchObject({
    sentenceVideoMode: "direct",
    sentenceVideoHMode: "template",
  });
});
it("explicit text settings override labels independently for each video target", () => {
  expect(
    imageSettingsFromLabels(
      {
        ...DEFAULT_BOOK_SETTINGS,
        sentenceVideoKind: "IMAGE_LAB_2_V",
        sentenceVideoHKind: "IMAGE_LAB_3_H",
        sentenceVideoMode: "template",
        sentenceVideoHMode: "direct",
      },
      [
        { id: 2, image_type: "ready_video" },
        { id: 3, image_type: "illustration" },
      ],
    ),
  ).toMatchObject({
    sentenceVideoMode: "template",
    sentenceVideoHMode: "direct",
  });
});
it("ready-video image prompts include source text and correct ratio even when the reference requests no text", () => {
  const row = {
    id: 2,
    kind: "image",
    prompt: "Ilustrasi tanpa teks",
    reference_key: null,
    image_type: "ready_video",
  };
  const vertical = productionLabText(row, "IMAGE_LAB_2_V", {
    teks: "Kalimat yang harus tampil.",
  });
  expect(vertical).toContain("Kalimat yang harus tampil.");
  expect(vertical).toContain("9:16");
  expect(vertical).toContain("menggantikan instruksi ilustrasi tanpa teks");
  expect(
    productionLabText(row, "IMAGE_LAB_2_H", { teks: "Kalimat" }),
  ).toContain("16:9");
});
it("ready-video sources can serve sentence video but cannot be used as illustration backgrounds or carousel", async () => {
  const db = {
    query: async () => [
      [{ id: 2, kind: "image", name: "Video", image_type: "ready_video" }],
    ],
  } as any;
  const settings = {
    ...DEFAULT_BOOK_SETTINGS,
    stockKinds: [],
    panelVertical: null,
    panelHorizontal: null,
    sentenceKinds: ["IMAGE_LAB_2_V"],
    sentenceVideoKind: "IMAGE_LAB_2_V",
  };
  await expect(
    validateLabSettings(db, settings, "book"),
  ).resolves.toBeUndefined();
  await expect(
    validateLabSettings(
      db,
      { ...settings, panelVertical: "IMAGE_LAB_2_V" },
      "book",
    ),
  ).rejects.toThrow("hanya");
});
