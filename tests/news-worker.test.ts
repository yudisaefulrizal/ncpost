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
