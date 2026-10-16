import { afterEach, expect, it, vi } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../src/server/config";
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
const LINK = "https://example.com/tekno/berita-1";
const labRow = (enabled = 1) => ({
  id: 5,
  theme: "Teknologi",
  sources: '["https://example.com"]',
  enabled,
  test_state: null,
  state: "idle",
  error: null,
  last_run_at: null,
});
const labType = (
  links: { url: string }[],
  prompt = "Tulis berita {{link_berita}}.",
  lab = labRow(),
) => {
  const s = store();
  vi.mocked(s.db.query).mockImplementation(
    async (sql: any) =>
      [
        sql.includes("content_types")
          ? [
              {
                id: 2,
                name: "Berita",
                engine: "news",
                outputs: ["POST_IMAGE"],
                settings: {
                  managed: true,
                  articleConfig: {
                    source: "lab",
                    labId: 5,
                    topicMode: "ai",
                    context: "",
                    topic: "",
                    material: "",
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
            ? [{ id: 1, kind: "article", reference_key: null, prompt }]
            : sql.startsWith("SELECT url FROM news_lab_links WHERE news_id")
              ? links
              : sql.startsWith("SELECT * FROM news_labs WHERE id")
                ? [lab]
                : sql.startsWith("INSERT IGNORE INTO news_lab_links")
                  ? { affectedRows: 1 }
                  : [],
      ] as any,
  );
  return s;
};
const searched = (text: string) =>
  [
    {
      type: "item.completed",
      item: { type: "web_search", action: { type: "search", query: "x" } },
    },
    { type: "item.completed", item: { type: "agent_message", text } },
  ]
    .map((e) => JSON.stringify(e))
    .join("\n");
it("tanpa Konfigurasi artikel, berita ditolak dan diminta memilih Lab Berita", async () => {
  const s = store();
  await runNewsJob(s, job);
  expect(runCli).not.toHaveBeenCalled();
  expect(s.complete).not.toHaveBeenCalled();
  expect(s.fail).toHaveBeenCalledWith(
    job,
    expect.stringContaining("Lab Berita"),
  );
});
it("sumber Lab Berita menulis dari link pilihan Jurnalis", async () => {
  const article = `# Judul\n\nIsi berita.\n\nSumber: Example ${LINK}/\n\nTag: tekno`;
  vi.mocked(runCli).mockResolvedValue(searched(article));
  const s = labType([{ url: LINK }]);
  await runNewsJob(s, job);
  expect(s.fail).not.toHaveBeenCalled();
  const [, args, prompt] = vi.mocked(runCli).mock.calls[0];
  expect(args).toContain("--search");
  expect(prompt).toContain(`Tulis berita ${LINK}.`);
  expect(s.complete).toHaveBeenCalledWith(
    job,
    expect.objectContaining({
      article,
      candidate_topics: [expect.objectContaining({ url: LINK })],
    }),
    expect.objectContaining({ configured: true, source: "lab" }),
  );
});
it("artikel lab yang tidak mengutip link Jurnalis ditolak", async () => {
  vi.mocked(runCli).mockResolvedValue(
    searched("# Judul\n\nIsi.\n\nSumber: https://example.com/lain\n\nTag: a"),
  );
  const s = labType([{ url: LINK }]);
  await runNewsJob(s, job);
  expect(s.complete).not.toHaveBeenCalled();
  expect(s.fail).toHaveBeenCalledWith(
    job,
    expect.stringContaining("link berita pilihan Jurnalis"),
  );
});
it("produksi memanggil Jurnalis untuk berita terbaru saat itu lalu menulisnya", async () => {
  const article = `# Judul\n\nIsi berita.\n\nSumber: ${LINK}\n\nTag: tekno`;
  vi.mocked(runCli)
    .mockResolvedValueOnce(searched(JSON.stringify({ links: [LINK] })))
    .mockResolvedValueOnce(searched(article));
  const s = labType([]);
  await runNewsJob(s, job);
  expect(s.fail).not.toHaveBeenCalled();
  const calls = vi.mocked(runCli).mock.calls;
  expect(calls[0][2]).toContain("paling baru terbit saat ini");
  expect(calls[0][3]).toBe(path.join(dir, "jurnalis"));
  expect(calls[1][2]).toContain(`Tulis berita ${LINK}.`);
  expect(vi.mocked(s.db.query)).toHaveBeenCalledWith(
    expect.stringContaining("INSERT IGNORE INTO news_lab_links"),
    [5, LINK, expect.any(String), expect.any(Number), job.id],
  );
  expect(s.complete).toHaveBeenCalled();
});
it("lab nonaktif tidak dipanggil dan artikel gagal tanpa memanggil provider", async () => {
  const s = labType([], undefined, labRow(0));
  await runNewsJob(s, job);
  expect(runCli).not.toHaveBeenCalled();
  expect(s.fail).toHaveBeenCalledWith(job, expect.stringContaining("nonaktif"));
});
it("provider gagal dilaporkan tanpa retry diam-diam atau hasil artikel palsu", async () => {
  vi.mocked(runCli).mockRejectedValue(Error("Provider timeout"));
  const s = labType([{ url: LINK }]);
  await runNewsJob(s, job);
  expect(s.fail).toHaveBeenCalledWith(job, "Provider timeout");
  expect(s.complete).not.toHaveBeenCalled();
  expect(runCli).toHaveBeenCalledTimes(1);
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
