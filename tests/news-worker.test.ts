import { afterEach, expect, it, vi } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../src/server/config";
import { newsArticlePrompt } from "../src/server/news";
import { newsFixture } from "./fixtures/news";
import { runCli } from "../src/server/providers";
import { runNewsJob } from "../src/worker/news";
import type { NewsStore, NewsArticle } from "../src/server/news-store";
vi.mock("../src/server/providers", async (original) => ({
  ...(await original<typeof import("../src/server/providers")>()),
  runCli: vi.fn(),
}));
const job = { id: -901, attempts: 1, state: "running" } as NewsArticle;
const root = path.join(ROOT, "output/berita", String(job.id));
const dir = path.join(root, "1");
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.clearAllMocks();
});
const store = () =>
  ({
    db: {
      query: vi.fn(async (sql: any) => [
        sql.includes("content_types")
          ? [
              {
                id: 2,
                name: "Berita",
                engine: "news",
                outputs: ["ARTICLE"],
                settings: null,
              },
            ]
          : [],
      ]),
    },
    heartbeat: vi.fn(),
    complete: vi.fn().mockResolvedValue(true),
    fail: vi.fn(),
  }) as unknown as NewsStore;
it("worker mengirim prompt utuh dan menyimpan artikel serta seluruh artefak riset", async () => {
  const result = newsFixture();
  vi.mocked(runCli).mockResolvedValue(
    [
      {
        type: "item.completed",
        item: {
          type: "web_search",
          action: { type: "search", query: "fixture" },
        },
      },
      {
        type: "item.completed",
        item: { type: "agent_message", text: JSON.stringify(result) },
      },
    ]
      .map((e) => JSON.stringify(e))
      .join("\n"),
  );
  const s = store();
  await runNewsJob(s, job);
  expect(runCli).toHaveBeenCalledWith(
    expect.any(String),
    expect.arrayContaining(["--search", "--output-schema"]),
    newsArticlePrompt(),
    dir,
    900000,
  );
  expect(readFileSync(path.join(dir, "prompt.md"), "utf8")).toBe(
    newsArticlePrompt(),
  );
  expect(readFileSync(path.join(dir, "article.md"), "utf8")).toBe(
    result.article,
  );
  expect(
    JSON.parse(readFileSync(path.join(dir, "candidate_topics.json"), "utf8")),
  ).toHaveLength(3);
  expect(s.complete).toHaveBeenCalledWith(
    job,
    result,
    expect.objectContaining({
      validation: expect.objectContaining({ ok: true }),
    }),
  );
  expect(s.fail).not.toHaveBeenCalled();
});
it("hasil yang tidak memiliki riset disimpan untuk diagnosis tetapi tidak ditandai selesai", async () => {
  vi.mocked(runCli).mockResolvedValue(
    JSON.stringify({
      type: "item.completed",
      item: { type: "agent_message", text: JSON.stringify(newsFixture()) },
    }),
  );
  const s = store();
  await runNewsJob(s, job);
  expect(s.complete).not.toHaveBeenCalled();
  expect(s.fail).toHaveBeenCalledWith(
    job,
    expect.stringContaining("bukti pencarian web"),
  );
  expect(
    JSON.parse(readFileSync(path.join(dir, "response.json"), "utf8")),
  ).toHaveProperty("article");
  expect(readFileSync(path.join(dir, "events.jsonl"), "utf8")).toContain(
    '"agent_message"',
  );
});
it("provider gagal dilaporkan tanpa retry diam-diam atau hasil artikel palsu", async () => {
  vi.mocked(runCli).mockRejectedValue(Error("Provider timeout"));
  const s = store();
  await runNewsJob(s, job);
  expect(s.fail).toHaveBeenCalledWith(job, "Provider timeout");
  expect(s.complete).not.toHaveBeenCalled();
  expect(runCli).toHaveBeenCalledTimes(1);
});

it("uses the enabled Lab news prompt while preserving research and output validation", async () => {
  const result = newsFixture();
  vi.mocked(runCli).mockResolvedValue(
    [
      {
        type: "item.completed",
        item: {
          type: "web_search",
          action: { type: "search", query: "fixture" },
        },
      },
      {
        type: "item.completed",
        item: { type: "agent_message", text: JSON.stringify(result) },
      },
    ]
      .map((item) => JSON.stringify(item))
      .join("\n"),
  );
  const s = store();
  vi.mocked(s.db.query).mockImplementation(
    async (sql: any) =>
      [
        String(sql).includes("content_types")
          ? [
              {
                id: 2,
                name: "Berita",
                engine: "news",
                outputs: ["ARTICLE"],
                settings: { stockKinds: [], labPromptIds: [12] },
              },
            ]
          : [
              {
                id: 12,
                kind: "article",
                reference_key: "news",
                prompt: "Instruksi berita dari Lab",
                reference_images: "[]",
              },
            ],
      ] as any,
  );
  await runNewsJob(s, job);
  expect(runCli).toHaveBeenCalledWith(
    expect.any(String),
    expect.any(Array),
    "Instruksi berita dari Lab",
    dir,
    900000,
  );
  expect(s.complete).toHaveBeenCalled();
  expect(s.fail).not.toHaveBeenCalled();
});

it.each(["knowledge", "manual", "web"] as const)(
  "configured articles use %s with the common structure and no fixed technology pipeline",
  async (source) => {
    const article =
      "# Topik umum\n\n## Heading\n\nSatu kalimat. Dua kalimat.\n\nParagraf kedua.\n\nSumber: https://example.com/sumber\n\nTag: umum";
    const config = {
      source,
      topicMode: "ai",
      context: "Topik umum",
      topic: "",
      material: source === "manual" ? "Bahan yang disediakan pengguna." : "",
      paragraphCount: 2,
    };
    const s = store();
    vi.mocked(s.db.query).mockImplementation(
      async (sql: any) =>
        [
          sql.includes("content_types")
            ? [
                {
                  id: 2,
                  name: "Umum",
                  engine: "news",
                  outputs: ["POST_IMAGE"],
                  settings: {
                    managed: true,
                    articleConfig: config,
                    labPromptIds: [1],
                    stockKinds: [],
                    sentenceKinds: [],
                    panelHorizontal: null,
                    panelVertical: null,
                    sentenceVideoKind: null,
                    sentenceVideoHKind: null,
                  },
                },
              ]
            : sql.includes("lab_prompts")
              ? [
                  {
                    id: 1,
                    kind: "article",
                    reference_key: null,
                    prompt: "Tulis artikel tentang {{konteks}}.",
                  },
                ]
              : [],
        ] as any,
    );
    vi.mocked(runCli).mockResolvedValue(
      [
        ...(source === "web"
          ? [
              {
                type: "item.completed",
                item: {
                  type: "web_search",
                  action: { type: "search", query: "topik" },
                },
              },
            ]
          : []),
        {
          type: "item.completed",
          item: { type: "agent_message", text: article },
        },
      ]
        .map((event) => JSON.stringify(event))
        .join("\n"),
    );
    await runNewsJob(s, job);
    expect(s.fail).not.toHaveBeenCalled();
    expect(s.complete).toHaveBeenCalledWith(
      job,
      expect.objectContaining({ article, article_config: config }),
      expect.objectContaining({ configured: true, source }),
    );
    const args = vi.mocked(runCli).mock.calls[0][1];
    expect(args.includes("--search")).toBe(source === "web");
    expect(args).not.toContain("--output-schema");
    expect(readFileSync(path.join(dir, "events.jsonl"), "utf8")).toContain(
      "agent_message",
    );
  },
);

it("configured web research rejects a response without a search tool event", async () => {
  const s = store();
  vi.mocked(s.db.query).mockImplementation(
    async (sql: any) =>
      [
        sql.includes("content_types")
          ? [
              {
                id: 2,
                name: "Umum",
                engine: "news",
                outputs: ["POST_IMAGE"],
                settings: {
                  managed: true,
                  articleConfig: {
                    source: "web",
                    topicMode: "ai",
                    paragraphCount: null,
                  },
                  labPromptIds: [1],
                  stockKinds: [],
                  sentenceKinds: [],
                  panelHorizontal: null,
                  panelVertical: null,
                  sentenceVideoKind: null,
                  sentenceVideoHKind: null,
                },
              },
            ]
          : sql.includes("lab_prompts")
            ? [
                {
                  id: 1,
                  kind: "article",
                  reference_key: null,
                  prompt: "Riset topik.",
                },
              ]
            : [],
      ] as any,
  );
  vi.mocked(runCli).mockResolvedValue(
    JSON.stringify({
      type: "item.completed",
      item: { type: "agent_message", text: "# Judul\n\nIsi." },
    }),
  );
  await runNewsJob(s, job);
  expect(s.complete).not.toHaveBeenCalled();
  expect(s.fail).toHaveBeenCalledWith(
    job,
    expect.stringContaining("bukti pencarian web"),
  );
});
