import { it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  agyArgs,
  agyInput,
  agyOptionsFromCodexArgs,
  agyToCodexEvents,
} from "../src/server/agy";
import { parseEvents } from "../src/server/providers";
import { collectAgyImage } from "../src/server/codex-image";
import { normalizeAiProvider } from "../src/server/ai-provider";
const id = "01a107dc-e68b-7e72-8cc1-2901211d7f7b";
const sub = "11a107dc-e68b-7e72-8cc1-2901211d7f7b";
const stream = (extra: object[] = [], response = "jawaban", more = {}) =>
  [
    {
      event: "step_update",
      step_update: {
        conversation_id: id,
        step_index: 2,
        tool_name: "search_web",
      },
    },
    ...extra,
    {
      event: "result",
      result: { conversation_id: id, status: "SUCCESS", response, ...more },
    },
  ]
    .map((e) => JSON.stringify(e))
    .join("\n");
it("agy: keluaran stream-json menjadi event Codex dengan bukti web search", () => {
  const events = agyToCodexEvents(stream());
  expect(parseEvents(events)).toBe("jawaban");
  expect(events).toContain('"web_search"');
});
it("agy: structured_output dipakai bila schema diberikan; status gagal ditolak", () => {
  expect(
    parseEvents(
      agyToCodexEvents(stream([], "teks", { structured_output: { a: 1 } })),
    ),
  ).toBe('{"a":1}');
  expect(() =>
    agyToCodexEvents(
      stream([], "", { status: "ERROR", error: "x" }).replace(
        '"SUCCESS"',
        '"ERROR"',
      ),
    ),
  ).toThrow(/agy gagal/);
});
it("agy: prompt lewat stdin dan opsi diturunkan dari argumen Codex", () => {
  expect(JSON.parse(agyInput("halo"))).toEqual({
    event: "user",
    message: { content: "halo" },
  });
  expect(agyArgs({ schema: "{}" })).toContain("--json-schema");
  const o = agyOptionsFromCodexArgs([
    "--search",
    "-c",
    `developer_instructions=${JSON.stringify("aturan")}`,
    "-",
  ]);
  expect(o).toMatchObject({ search: true, instructions: "aturan" });
  expect(agyOptionsFromCodexArgs(["-"])).toMatchObject({ search: false });
});
it("agy: gambar baru di folder percakapan (induk atau subagen) diproses", async () => {
  const home = await mkdtemp(path.join(process.cwd(), "data/ncpost-agy-test-"));
  try {
    const startedAt = Date.now() - 1000;
    const dir = path.join(home, ".gemini/antigravity-cli/brain", id);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "a.jpg"),
      await sharp({
        create: { width: 64, height: 36, channels: 3, background: "white" },
      })
        .jpeg()
        .toBuffer(),
    );
    const out = path.join(home, "out/image.jpg");
    const r = await collectAgyImage(
      stream([], `ok ${path.join(dir, "a.jpg")}`),
      {
        home,
        output: out,
        startedAt,
        orientation: "horizontal",
      },
    );
    expect(r).toMatchObject({ width: 1920, height: 1080, thread: id });
    await expect(
      collectAgyImage(stream(), {
        home,
        output: out,
        startedAt: Date.now() + 5000,
        orientation: "horizontal",
      }),
    ).rejects.toThrow(/0 gambar baru/);
    await expect(
      collectAgyImage(stream(), {
        home,
        output: out,
        startedAt,
        orientation: "vertikal",
      }),
    ).rejects.toThrow(/Orientasi/);
    void sub;
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
it("penyedia AI hanya codex atau agy", () => {
  expect(normalizeAiProvider("agy")).toBe("agy");
  expect(() => normalizeAiProvider("x")).toThrow();
});
