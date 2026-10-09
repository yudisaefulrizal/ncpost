import { expect, it } from "vitest";
import {
  contentStages,
  contentAllows,
  normalizeContentType,
  contentTypeUpdate,
  type ContentType,
} from "../src/server/content-type-domain";
import {
  currentContentType,
  withContentType,
} from "../src/server/content-types";
import { chapterDir } from "../src/server/output-paths";
import { partNumber } from "../src/server/domain";
const type = (outputs: string[], id = 3): ContentType => ({
  id,
  ...normalizeContentType({ name: "Jenis saya", engine: "book", outputs }),
});
it("Video V includes only its required stages and sources", () => {
  const selected = type(["VIDEO_KALIMAT"]);
  expect([...contentStages(selected)].sort()).toEqual(
    ["ARTICLE", "IMAGES_VIDEO", "TTS_KALIMAT", "VIDEO_KALIMAT"].sort(),
  );
  expect(selected.settings).toMatchObject({
    stockKinds: [],
    panelHorizontal: null,
    panelVertical: null,
    sentenceKinds: ["IMAGE_VERTICAL"],
    sentenceVideoKind: "IMAGE_VERTICAL",
    sentenceVideoHKind: null,
  });
  expect(contentAllows(selected, "S_IMAGE_VERTICAL")).toBe(true);
  for (const kind of [
    "PANEL",
    "QUOTE",
    "IMAGE_VERTICAL",
    "VIDEO_KALIMAT_H",
    "POST_IG",
  ])
    expect(contentAllows(selected, kind)).toBe(false);
});
it("image-only types do not require rendering, audio, or video", () => {
  for (const output of ["IMAGES_PANEL", "IMAGES_VIDEO"]) {
    const selected = type([output]);
    expect([...contentStages(selected)].sort()).toEqual(
      ["ARTICLE", output].sort(),
    );
    expect(selected.settings?.panelHorizontal).toBeNull();
    expect(selected.settings?.panelVertical).toBeNull();
    expect(contentAllows(selected, "TTS_KALIMAT")).toBe(false);
  }
});
it("panel and quote outputs include prerequisites and allow matching publication only", () => {
  const panel = type(["PANEL"]);
  expect(contentStages(panel).has("IMAGES_PANEL")).toBe(true);
  expect(panel.settings?.stockKinds).toEqual(["IMAGE_HORIZONTAL"]);
  expect(contentAllows(panel, "POST_IG")).toBe(true);
  expect(contentAllows(panel, "REELS_IG")).toBe(false);
  expect(contentStages(type(["QUOTE_IMAGE"])).has("QUOTE")).toBe(true);
});
it("new output choices retain account targets and use sources for the chosen orientation", () => {
  const previous = type(["VIDEO_KALIMAT"]);
  previous.settings!.youtubeAccountId = "66b2e19d8c3f5a7e9d0b1c2d";
  const next = contentTypeUpdate(
    {
      name: previous.name,
      engine: previous.engine,
      outputs: ["VIDEO_KALIMAT_H"],
    },
    previous,
  );
  expect(next.settings.youtubeAccountId).toBe(
    previous.settings!.youtubeAccountId,
  );
  expect(next.settings.sentenceVideoKind).toBeNull();
  expect(next.settings.sentenceVideoHKind).toBe("IMAGE_HORIZONTAL");
  expect(next.settings.sentenceKinds).toEqual(["IMAGE_HORIZONTAL"]);
  expect(previous.settings!.sentenceKinds).toEqual(["IMAGE_VERTICAL"]);
});
it("validates user-defined names, source engines, outputs, and required source settings", () => {
  expect(() =>
    normalizeContentType({ name: " ", engine: "book", outputs: ["ARTICLE"] }),
  ).toThrow("Nama jenis");
  expect(() =>
    normalizeContentType({ name: "X", engine: "other", outputs: ["ARTICLE"] }),
  ).toThrow("Sumber artikel");
  expect(() =>
    normalizeContentType({
      name: "X",
      engine: "book",
      outputs: ["UNKNOWN_OUTPUT"],
    }),
  ).toThrow("keluaran");
  expect(() =>
    normalizeContentType({ name: "X", engine: "news", outputs: ["QUOTE"] }),
  ).toThrow("keluaran");
  expect(() =>
    normalizeContentType({
      name: "X",
      engine: "news",
      outputs: ["PANEL"],
      settings: { stockKinds: [] },
    }),
  ).toThrow("Panel membutuhkan");
  expect(
    normalizeContentType({
      name: "  Infografis  ",
      engine: "news",
      outputs: ["POST_IMAGE"],
    }).name,
  ).toBe("Infografis");
});
it("keeps concurrent type contexts separate and releases context afterwards", async () => {
  const first = type(["ARTICLE"], 3),
    second = type(["VIDEO_KALIMAT"], 4);
  const results = await Promise.all(
    [first, second].map((selected) =>
      withContentType(selected, async () => {
        await new Promise((resolve) =>
          setTimeout(resolve, selected.id === 3 ? 10 : 1),
        );
        return currentContentType()?.id;
      }),
    ),
  );
  expect(results).toEqual([3, 4]);
  expect(currentContentType()).toBeUndefined();
});
it("identical book and chapter names use distinct output folders and numbering per type", () => {
  const base = {
    id: 1,
    book: "Buku sama",
    title: "Bagian sama",
    part_number: null,
  };
  expect(chapterDir(base)).not.toBe(
    chapterDir({ ...base, content_type_id: 3 }),
  );
  const rows = [
    { ...base, content_type_id: 1 },
    { ...base, id: 2, content_type_id: 3 },
  ];
  expect(partNumber(rows, rows[1])).toBe(1);
});

it("whole-text images work for both sources without other image, audio, or video stages", () => {
  for (const engine of ["book", "news"]) {
    const selected = normalizeContentType({
      name: "Seluruh teks",
      engine,
      outputs: ["POST_IMAGE"],
    });
    expect([...contentStages(selected)]).toEqual(["ARTICLE", "POST_IMAGE"]);
    expect(selected.settings.stockKinds).toEqual([]);
    expect(selected.settings.sentenceKinds).toEqual([]);
    expect(selected.settings.panelHorizontal).toBeNull();
  }
});
