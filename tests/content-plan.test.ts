import { expect, it } from "vitest";
import {
  normalizeContentType,
  type ContentType,
} from "../src/server/content-type-domain";
import { nextBookJob, nextNewsJob } from "../src/server/content-plan";
import type { Chapter } from "../src/server/store";
import { articleSentences, PANEL_COUNT } from "../src/server/domain";
import {
  emptyNewsProduction,
  newsContent,
} from "../src/server/news-production-domain";
import { newsFixture } from "./fixtures/news";
const article =
  "# Judul\n\n## Hook\n\nHook.\n\nSatu.\n\nDua.\n\nTiga.\n\nEmpat.\n\nLima.\n\nBerdasarkan buku Buku, Penulis.\n\nTag: buku";
const type = (outputs: string[]): ContentType => ({
  id: 8,
  ...normalizeContentType({ name: "Buku saya", engine: "book", outputs }),
});
const chapter = (patch: Partial<Chapter> = {}) =>
  ({ article, article_status: "siap", stock_counts: {}, ...patch }) as Chapter;
it("starts every new book part with article generation, without per-book schedules", () => {
  const t = type(["VIDEO_KALIMAT"]);
  expect(nextBookJob(t, chapter({ article: "" }), t.settings!, [])).toBe(
    "ARTICLE",
  );
  expect(
    nextBookJob(
      t,
      chapter({ article: "", book: "Buku lain" }),
      t.settings!,
      [],
    ),
  ).toBe("ARTICLE");
});
it("single image never queues audio, stock lanes, or rendering", () => {
  const t = type(["POST_IMAGE"]);
  expect(nextBookJob(t, chapter(), t.settings!, [])).toBe("POST_IMAGE");
  expect(
    nextBookJob(t, chapter({ text_image: "{}" }), t.settings!, []),
  ).toBeNull();
});
it("vertical video advances through images and audio to rendering then stops", () => {
  const t = type(["VIDEO_KALIMAT"]),
    s = t.settings!;
  expect(nextBookJob(t, chapter(), s, [])).toBe("S_IMAGE_VERTICAL");
  const c = chapter({
    stock_counts: { S_IMAGE_VERTICAL: articleSentences(article).length },
  });
  expect(nextBookJob(t, c, s, [])).toBe("TTS_KALIMAT");
  c.sentence_audio = "{}";
  expect(nextBookJob(t, c, s, [])).toBe("VIDEO_KALIMAT");
  c.sentence_video = "{}";
  expect(nextBookJob(t, c, s, [])).toBeNull();
});
it("carousel stops after its images and panels, without publishing", () => {
  const t = type(["PANEL"]),
    s = t.settings!;
  expect(nextBookJob(t, chapter(), s, [])).toBe("IMAGE_HORIZONTAL");
  const c = chapter({ stock_counts: { IMAGE_HORIZONTAL: PANEL_COUNT } });
  expect(nextBookJob(t, c, s, [])).toBe("PANEL");
  c.panels = "{}";
  expect(nextBookJob(t, c, s, [])).toBeNull();
});
it("active jobs prevent duplicates and failures wait for explicit retry", () => {
  const t = type(["POST_IMAGE"]),
    c = chapter(),
    s = t.settings!;
  expect(
    nextBookJob(t, c, s, [{ kind: "POST_IMAGE", state: "queued" }]),
  ).toBeNull();
  expect(
    nextBookJob(t, c, s, [{ kind: "POST_IMAGE", state: "failed" }]),
  ).toBeNull();
  expect(
    nextBookJob(t, c, s, [
      { kind: "POST_IMAGE", state: "completed" },
      { kind: "POST_IMAGE", state: "failed" },
    ]),
  ).toBe("POST_IMAGE");
});
it("edited valid articles are reviewed before producing media", () => {
  const t = type(["POST_IMAGE"]);
  expect(
    nextBookJob(
      t,
      chapter({ article_status: "menunggu editor" }),
      t.settings!,
      [],
    ),
  ).toBe("EDITOR");
  expect(
    nextBookJob(
      t,
      chapter({ article: "Teks tidak valid", article_status: "draft" }),
      t.settings!,
      [],
    ),
  ).toBeNull();
});
it("news follows the same final output plan and handles individual completed stock lanes", () => {
  const t = type(["VIDEO_KALIMAT"]),
    s = t.settings!,
    p = emptyNewsProduction(),
    a = newsFixture().article;
  expect(nextNewsJob(t, a, s, p)).toBe("S_IMAGE_VERTICAL");
  p.stock = newsContent(a).sentences.map((_, panel) => ({
    kind: "S_IMAGE_VERTICAL",
    panel,
    asset_id: panel,
    file: "x",
    description: "x",
  }));
  expect(nextNewsJob(t, a, s, p)).toBe("TTS_KALIMAT");
  p.outputs.TTS_KALIMAT = {};
  expect(nextNewsJob(t, a, s, p)).toBe("VIDEO_KALIMAT");
  p.outputs.VIDEO_KALIMAT = { source: s.sentenceVideoKind };
  expect(nextNewsJob(t, a, s, p)).toBeNull();
});
it("news failure is not retried automatically", () => {
  const t = type(["POST_IMAGE"]),
    p = emptyNewsProduction();
  p.jobs = [{ id: 1, kind: "POST_IMAGE", state: "failed" } as any];
  expect(nextNewsJob(t, newsFixture().article, t.settings!, p)).toBeNull();
});

it("changing styles does not regenerate completed outputs or unused prerequisites", () => {
  const t = type(["VIDEO_KALIMAT"]),
    s = {
      ...t.settings!,
      sentenceVideoKind: "IMAGE_PAPERCUT",
      sentenceKinds: ["IMAGE_PAPERCUT"],
    };
  expect(nextBookJob(t, chapter({ sentence_video: "{}" }), s, [])).toBeNull();
  const p = emptyNewsProduction();
  p.outputs.VIDEO_KALIMAT = { source: "IMAGE_VERTICAL" };
  expect(nextNewsJob(t, newsFixture().article, s, p)).toBeNull();
});
it("adding single-image output to completed video only queues the new output", () => {
  const t = type(["VIDEO_KALIMAT", "POST_IMAGE"]);
  expect(
    nextBookJob(t, chapter({ sentence_video: "{}" }), t.settings!, []),
  ).toBe("POST_IMAGE");
});

it("an editor rejection waits for an edit instead of requesting reviews forever", () => {
  const t = type(["POST_IMAGE"]);
  expect(
    nextBookJob(t, chapter({ article_status: "revisi" }), t.settings!, [
      { kind: "EDITOR", state: "completed" },
    ]),
  ).toBeNull();
});
it("cancelled dependent rendering resumes after regenerated prerequisites finish", () => {
  const t = type(["VIDEO_KALIMAT"]);
  const c = chapter({
    sentence_audio: "{}",
    stock_counts: { S_IMAGE_VERTICAL: articleSentences(article).length },
  });
  expect(
    nextBookJob(t, c, t.settings!, [
      { kind: "VIDEO_KALIMAT", state: "cancelled" },
    ]),
  ).toBe("VIDEO_KALIMAT");
});
