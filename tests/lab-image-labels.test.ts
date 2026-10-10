import { expect, it, vi } from "vitest";
import { labInput, LabStore } from "../src/server/lab";
import { imageSettingsFromLabels } from "../src/server/lab-image-settings";
import {
  normalizeContentType,
  contentStages,
} from "../src/server/content-type-domain";
import { DEFAULT_BOOK_SETTINGS } from "../src/server/book-settings";
import { labImageCatalog } from "../src/server/lab-image-types";
import { validateLabSettings } from "../src/server/lab-production";
const input = { kind: "image", name: "Brand", prompt: "Teks, logo dan desain" };
it("image labels default to illustration, validate values, and are unavailable to article prompts", () => {
  expect(labInput(input).imageType).toBe("illustration");
  expect(labInput({ ...input, imageType: "ready_post" }).imageType).toBe(
    "ready_post",
  );
  expect(() => labInput({ ...input, imageType: "video" })).toThrow(
    "Jenis gambar",
  );
  expect(() =>
    labInput({ ...input, kind: "article", imageType: "ready_post" }),
  ).toThrow("hanya untuk Lab Gambar");
});
it("test runs snapshot the image label and saved prompts retain it", async () => {
  const query = vi.fn().mockResolvedValue([{ insertId: 5, affectedRows: 1 }]);
  const store = new LabStore({ query } as any);
  await store.save({ ...input, imageType: "ready_post" });
  expect(query.mock.calls[0][1]?.at(-1)).toBe("ready_post");
  await store.enqueue({ ...input, imageType: "ready_post" });
  expect(query.mock.calls[1][1]?.at(-1)).toBe("ready_post");
  await store.save({ ...input, imageType: "illustration" }, 5);
  expect(query.mock.calls[2][1]).toContain("illustration");
});
it("labels determine production automatically even if submitted modes contradict them", () => {
  const selected = {
    ...DEFAULT_BOOK_SETTINGS,
    panelVertical: "IMAGE_LAB_5_V",
    wholeTextImageKind: "IMAGE_LAB_6_H",
    carouselMode: "template" as const,
    singleImageMode: "direct" as const,
  };
  const settings = imageSettingsFromLabels(selected, [
    { id: 5, image_type: "ready_post" },
    { id: 6, image_type: "illustration" },
  ]);
  expect(settings.carouselMode).toBe("direct");
  expect(settings.singleImageMode).toBe("direct");
  const type = {
    id: 8,
    ...normalizeContentType({
      name: "Brand",
      engine: "book",
      outputs: ["PANEL", "POST_IMAGE"],
      settings,
    }),
  };
  expect(type.settings.stockKinds).toEqual([]);
  expect(contentStages(type).has("IMAGES_PANEL")).toBe(false);
  const changed = imageSettingsFromLabels(settings, [
    { id: 5, image_type: "illustration" },
    { id: 6, image_type: "ready_post" },
  ]);
  expect(changed.carouselMode).toBe("template");
  expect(changed.singleImageMode).toBe("direct");
});
it("catalog exposes labels without changing image keys or static references", () => {
  const c = labImageCatalog([
    { id: 5, name: "Brand", image_type: "ready_post" },
  ]);
  expect(c.stock).toHaveLength(2);
  expect(c.stock[0]).toMatchObject({
    kind: "IMAGE_LAB_5_H",
    imageType: "ready_post",
  });
  expect(c.stock[1]).toMatchObject({
    kind: "IMAGE_LAB_5_V",
    imageType: "ready_post",
  });
});
it("ready-to-post images cannot be selected as video/template background lanes", async () => {
  const db = {
    query: vi
      .fn()
      .mockResolvedValue([
        [{ id: 5, kind: "image", name: "Brand", image_type: "ready_post" }],
      ]),
  } as any;
  await expect(
    validateLabSettings(
      db,
      { ...DEFAULT_BOOK_SETTINGS, sentenceKinds: ["IMAGE_LAB_5_V"] },
      "book",
    ),
  ).rejects.toThrow("sumber ilustrasi");
  await expect(
    validateLabSettings(
      db,
      {
        ...DEFAULT_BOOK_SETTINGS,
        stockKinds: [],
        sentenceKinds: [],
        panelHorizontal: null,
        panelVertical: "IMAGE_LAB_5_V",
      },
      "book",
    ),
  ).resolves.toBeUndefined();
});
