import { it, expect } from "vitest";
import {
  DEFAULT_BOOK_SETTINGS,
  normalizeBookSettings,
  panelSources,
} from "../src/server/book-settings";
it("bawaan sama dengan perilaku lama", () => {
  expect(DEFAULT_BOOK_SETTINGS).toEqual({
    stockKinds: [
      "IMAGE_HORIZONTAL",
      "IMAGE_VERTICAL",
      "IMAGE_MINIMALIST",
      "IMAGE_PAPERCUT",
      "IMAGE_PAPERCUT_HORIZONTAL",
    ],
    sentenceKinds: [],
    sentenceVideoKind: null,
    sentenceVideoHKind: null,
    instagramAccountId: null,
    youtubeAccountId: null,
    tiktokAccountId: null,
    quoteImageStyle: "QUOTE_PAPERCUT",
    panelHorizontal: "IMAGE_HORIZONTAL",
    panelVertical: "IMAGE_VERTICAL",
  });
});
it("sumber panel otomatis ikut dibuat dan urutan stabil; videoKind lama diabaikan", () => {
  expect(
    normalizeBookSettings({
      stockKinds: ["IMAGE_MINIMALIST"],
      panelHorizontal: null,
      panelVertical: "IMAGE_PAPERCUT",
      videoKind: "IMAGE_VERTICAL",
    }),
  ).toEqual({
    stockKinds: ["IMAGE_MINIMALIST", "IMAGE_PAPERCUT"],
    sentenceKinds: [],
    sentenceVideoKind: null,
    sentenceVideoHKind: null,
    instagramAccountId: null,
    youtubeAccountId: null,
    tiktokAccountId: null,
    quoteImageStyle: "QUOTE_PAPERCUT",
    panelHorizontal: null,
    panelVertical: "IMAGE_PAPERCUT",
  });
  expect(
    panelSources(normalizeBookSettings({ panelVertical: "IMAGE_PAPERCUT" })),
  ).toEqual(["IMAGE_PAPERCUT"]);
});
it("panel opsional; sumber yang dipilih harus sesuai orientasi", () => {
  expect(normalizeBookSettings({ stockKinds: [] })).toMatchObject({
    stockKinds: [],
    panelHorizontal: null,
    panelVertical: null,
  });
  expect(() =>
    normalizeBookSettings({ panelHorizontal: "IMAGE_PAPERCUT" }),
  ).toThrow(/horizontal/);
  expect(() =>
    normalizeBookSettings({ panelVertical: "IMAGE_HORIZONTAL" }),
  ).toThrow(/vertikal/);
  expect(() =>
    normalizeBookSettings({
      panelHorizontal: "IMAGE_HORIZONTAL",
      stockKinds: ["VIDEO"],
    }),
  ).toThrow(/tidak dikenal/);
});
it("paper cut horizontal boleh jadi sumber panel horizontal, bukan vertikal", () => {
  expect(
    normalizeBookSettings({ panelHorizontal: "IMAGE_PAPERCUT_HORIZONTAL" })
      .stockKinds,
  ).toEqual(["IMAGE_PAPERCUT_HORIZONTAL"]);
  expect(() =>
    normalizeBookSettings({ panelVertical: "IMAGE_PAPERCUT_HORIZONTAL" }),
  ).toThrow(/vertikal/);
});
it("gaya gambar quote harus dikenal", () => {
  expect(() =>
    normalizeBookSettings({
      panelHorizontal: "IMAGE_HORIZONTAL",
      quoteImageStyle: "LAIN",
    }),
  ).toThrow(/gambar quote/);
});

it("gambar per kalimat: lajur bisa diaktifkan, urutan stabil, jenis divalidasi", () => {
  expect(
    normalizeBookSettings({
      stockKinds: [],
      panelVertical: "IMAGE_VERTICAL",
      sentenceKinds: ["IMAGE_PAPERCUT", "IMAGE_HORIZONTAL"],
    }).sentenceKinds,
  ).toEqual(["IMAGE_HORIZONTAL", "IMAGE_PAPERCUT"]);
  expect(() =>
    normalizeBookSettings({
      panelVertical: "IMAGE_VERTICAL",
      sentenceKinds: ["LAIN"],
    }),
  ).toThrow(/kalimat/);
});

it("sumber video kalimat ikut dibuat sebagai gambar kalimat", () => {
  const r = normalizeBookSettings({
    panelVertical: "IMAGE_VERTICAL",
    sentenceKinds: ["IMAGE_HORIZONTAL"],
    sentenceVideoKind: "IMAGE_PAPERCUT",
  });
  expect(r.sentenceKinds).toEqual(["IMAGE_HORIZONTAL", "IMAGE_PAPERCUT"]);
  expect(r.sentenceVideoKind).toBe("IMAGE_PAPERCUT");
  expect(() =>
    normalizeBookSettings({
      panelVertical: "IMAGE_VERTICAL",
      sentenceVideoKind: "X",
    }),
  ).toThrow(/video kalimat/);
});

it("sumber video kalimat horizontal hanya lajur horizontal, ikut dibuat", () => {
  const r = normalizeBookSettings({
    panelVertical: "IMAGE_VERTICAL",
    sentenceVideoHKind: "IMAGE_PAPERCUT_HORIZONTAL",
  });
  expect(r.sentenceKinds).toEqual(["IMAGE_PAPERCUT_HORIZONTAL"]);
  expect(() =>
    normalizeBookSettings({
      panelVertical: "IMAGE_VERTICAL",
      sentenceVideoHKind: "IMAGE_VERTICAL",
    }),
  ).toThrow(/horizontal/);
});

it("sumber video kalimat (vertikal 9:16) hanya lajur vertikal", () => {
  expect(() =>
    normalizeBookSettings({
      panelVertical: "IMAGE_VERTICAL",
      sentenceVideoKind: "IMAGE_PAPERCUT_HORIZONTAL",
    }),
  ).toThrow(/vertikal/);
});

it("menyimpan akun YouTube/TikTok per konten dan menolak ID tidak valid", () => {
  const id = "66b2e19d8c3f5a7e9d0b1c2d";
  const normalized = normalizeBookSettings({
    ...DEFAULT_BOOK_SETTINGS,
    youtubeAccountId: id,
    tiktokAccountId: id,
  });
  expect(normalized.youtubeAccountId).toBe(id);
  expect(normalized.tiktokAccountId).toBe(id);
  expect(() =>
    normalizeBookSettings({
      ...DEFAULT_BOOK_SETTINGS,
      youtubeAccountId: "invalid",
    }),
  ).toThrow("ID akun");
});

it("pengaturan otomatis lama tidak mengaktifkan produksi tanpa jadwal", () => {
  expect(
    normalizeBookSettings({ ...DEFAULT_BOOK_SETTINGS, autoProcess: true })
      .autoProcess,
  ).toBe(false);
});
