import { afterEach, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import path from "node:path";
import {
  acceptLinks,
  jurnalisPrompt,
  linkHash,
  normalizeNewsLab,
  type NewsLab,
  type NewsLabStore,
} from "../src/server/news-lab";
import {
  LAB_NEWS_FORMAT,
  normalizeArticleConfig,
} from "../src/server/content-contract";
import {
  articleInstructions,
  jurnalisCliArgs,
  labArticle,
  runJurnalisTest,
  type JurnalisCall,
} from "../src/worker/jurnalis";
import { citesLink } from "../src/worker/configured-article";
import { outputRoot } from "../src/server/output-paths";

const lab: NewsLab = {
  id: 7,
  theme: "Teknologi",
  sources: ["https://www.theverge.com/tech", "https://dailysocial.id"],
  prompt: "Tulis artikel dari {{link_berita}} untuk tema {{konteks}}.",
  enabled: true,
  test: null,
  state: "idle",
  error: null,
  lastRunAt: null,
};
const work = path.join(outputRoot(), "jurnalis", "7");
afterEach(() => rmSync(work, { recursive: true, force: true }));

it("lab dinormalisasi: tema, link sumber unik dan valid, prompt wajib", () => {
  const prompt = "Tulis artikel.";
  expect(
    normalizeNewsLab({
      theme: " Teknologi ",
      sources: ["theverge.com/tech", "https://theverge.com/tech/", ""],
      prompt: ` ${prompt} `,
    }),
  ).toEqual({
    theme: "Teknologi",
    sources: ["https://theverge.com/tech"],
    prompt,
  });
  expect(() =>
    normalizeNewsLab({ theme: "", sources: ["a.com"], prompt }),
  ).toThrow("Tema");
  expect(() => normalizeNewsLab({ theme: "T", sources: [], prompt })).toThrow(
    "minimal satu",
  );
  expect(() =>
    normalizeNewsLab({ theme: "T", sources: ["bukan link"], prompt }),
  ).toThrow("bukan link");
  expect(() =>
    normalizeNewsLab({ theme: "T", sources: ["a.com"], prompt: " " }),
  ).toThrow("Prompt artikel");
  expect(() =>
    normalizeNewsLab({ theme: "T", sources: ["a.com"], prompt: "{{judul}}" }),
  ).toThrow("{{judul}}");
});

it("link Jurnalis hanya dari domain sumber, bukan halaman depan, belum dipakai, unik", () => {
  const used = new Set([linkHash("https://theverge.com/lama")]);
  expect(
    acceptLinks(
      [
        "https://www.theverge.com/news/1?utm_source=x",
        "https://theverge.com/news/1",
        "https://theverge.com/lama",
        "https://theverge.com/",
        "https://evil.test/?u=theverge.com",
        "https://theverge.com.evil.test/news",
        "http://dailysocial.id/post/2",
        "https://m.dailysocial.id/post/3",
        "https://dailysocial.id/post/4",
      ],
      lab.sources,
      used,
      2,
    ),
  ).toEqual(["https://theverge.com/news/1", "https://m.dailysocial.id/post/3"]);
});

const ARTICLE = (link: string) =>
  `# Judul\n\n## Judul\n\nIsi berita.\n\nSumber: Media, ${link}\n\nTag: tekno`;
const fakeStore = (current: NewsLab = lab, held: string | null = null) =>
  ({
    get: vi.fn().mockResolvedValue(current),
    held: vi.fn().mockResolvedValue(held),
    usedUrls: vi.fn().mockResolvedValue([]),
    usedHashes: vi.fn().mockResolvedValue(new Set()),
    use: vi.fn(),
    working: vi.fn(),
    finish: vi.fn(),
    finishTest: vi.fn(),
  }) as unknown as NewsLabStore & Record<string, any>;
/** Model palsu: jawaban per langkah (search, article, format). */
const fakeModel = (answers: Partial<Record<string, string>>) =>
  vi.fn(async (call: JurnalisCall) => {
    const answer = answers[call.name];
    if (answer === undefined) throw Error(`tak terduga: ${call.name}`);
    return answer;
  });

it("prompt Jurnalis meminta satu berita paling baru saat ini dari sumber lab", () => {
  const prompt = jurnalisPrompt(lab, ["https://theverge.com/lama"]);
  expect(prompt).toContain("Tema liputan: Teknologi");
  expect(prompt).toContain("paling baru terbit saat ini");
  expect(prompt).toContain("- https://dailysocial.id");
  expect(prompt).toContain("Pilih satu berita");
  expect(prompt).toContain("- https://theverge.com/lama");
});

it("argumen Codex memakai web search, output schema, dan instruksi runtime seperti berita Hermes", () => {
  const args = jurnalisCliArgs(
    {
      prompt: "",
      work: "",
      name: "article",
      search: true,
      instructions: "ATURAN",
    },
    "/tmp/s.json",
  );
  expect(args).toEqual(
    expect.arrayContaining([
      "--search",
      "--enable",
      "code_mode_host",
      "--output-schema",
      "/tmp/s.json",
      `developer_instructions=${JSON.stringify("ATURAN")}`,
    ]),
  );
  expect(
    args.some((a, i) => a === "--disable" && args[i + 1] === "code_mode_host"),
  ).toBe(false);
  const plain = jurnalisCliArgs({
    prompt: "",
    work: "",
    name: "format",
    search: false,
  });
  expect(plain).not.toContain("--search");
  expect(plain).not.toContain("--output-schema");
  const rules = articleInstructions(lab, "https://dailysocial.id/a");
  expect(rules).toContain("objek JSON sesuai output schema");
  expect(rules).toContain("https://dailysocial.id/a");
  expect(rules).toContain(LAB_NEWS_FORMAT);
});

it("dipanggil produksi: satu berita dicatat, prompt lab dikirim utuh, artikel dari JSON", async () => {
  const store = fakeStore();
  const link = "https://dailysocial.id/b";
  const model = fakeModel({
    search: JSON.stringify({ link }),
    article: JSON.stringify({ article: ARTICLE(link) }),
  });
  const result = await labArticle(store, 7, 41, work, model);
  expect(result.link).toBe(link);
  expect(result.article).toBe(ARTICLE(link));
  const [searchCall, articleCall] = model.mock.calls.map((c) => c[0]);
  expect(searchCall).toMatchObject({ name: "search", search: true });
  expect(articleCall.prompt).toBe(
    `Tulis artikel dari ${link} untuk tema Teknologi.`,
  );
  expect(articleCall).toMatchObject({
    search: true,
    schema: expect.any(Object),
  });
  expect(articleCall.instructions).toContain(LAB_NEWS_FORMAT);
  expect(store.use).toHaveBeenCalledWith(7, link, 41);
  expect(store.finish).toHaveBeenCalledWith(7, null);
});

it("format rusak diperbaiki sekali tanpa web lalu dicek ulang", async () => {
  const link = "https://dailysocial.id/f";
  const model = fakeModel({
    search: JSON.stringify({ link }),
    article: JSON.stringify({ article: "Saya sudah membaca beritanya." }),
    format: ARTICLE(link),
  });
  const result = await labArticle(fakeStore(), 7, 41, work, model);
  expect(result.article).toBe(ARTICLE(link));
  const fix = model.mock.calls[2][0];
  expect(fix).toMatchObject({ name: "format", search: false });
  expect(fix.prompt).toContain("Perbaiki HANYA format");
  expect(fix.prompt).toContain("Judul wajib di awal");
  const broken = fakeModel({
    search: JSON.stringify({ link }),
    article: JSON.stringify({ article: "bukan artikel" }),
    format: "masih bukan artikel",
  });
  await expect(labArticle(fakeStore(), 7, 41, work, broken)).rejects.toThrow(
    "Format artikel tetap rusak",
  );
});

it("percobaan ulang artikel memakai link yang sudah dipegang tanpa mencari lagi", async () => {
  const link = "https://dailysocial.id/lama";
  const store = fakeStore(lab, link);
  const model = fakeModel({
    article: JSON.stringify({ article: ARTICLE(link) }),
  });
  expect((await labArticle(store, 7, 41, work, model)).link).toBe(link);
  expect(model).toHaveBeenCalledTimes(1);
  expect(store.use).not.toHaveBeenCalled();
});

it("lab nonaktif atau berita di luar sumber digagalkan", async () => {
  await expect(
    labArticle(
      fakeStore({ ...lab, enabled: false }),
      7,
      41,
      work,
      fakeModel({}),
    ),
  ).rejects.toThrow("nonaktif");
  const store = fakeStore();
  await expect(
    labArticle(
      store,
      7,
      41,
      work,
      fakeModel({ search: '{"link":"https://lain.com/x"}' }),
    ),
  ).rejects.toThrow("tidak menemukan berita baru");
  expect(store.use).not.toHaveBeenCalled();
});

it("Tes menampilkan satu berita terbaru dan artikelnya tanpa mencatat", async () => {
  const store = fakeStore();
  const link = "https://dailysocial.id/a";
  await runJurnalisTest(
    store,
    lab,
    fakeModel({
      search: JSON.stringify({ link }),
      article: JSON.stringify({ article: ARTICLE(link) }),
    }),
    125,
  );
  expect(store.use).not.toHaveBeenCalled();
  expect(store.finishTest).toHaveBeenCalledWith(7, {
    links: [link],
    article: ARTICLE(link),
    error: null,
  });
  await runJurnalisTest(store, lab, vi.fn().mockRejectedValue(Error("x")), 126);
  expect(store.finishTest).toHaveBeenLastCalledWith(7, {
    links: [],
    article: null,
    error: "x",
  });
});

it("sumber Lab Berita wajib memilih lab; link sumber dibandingkan setelah normalisasi", () => {
  const base = {
    source: "lab",
    topicMode: "ai",
    context: "",
    topic: "",
    material: "",
    paragraphCount: null,
  };
  expect(() => normalizeArticleConfig(base)).toThrow("Lab Berita");
  expect(normalizeArticleConfig({ ...base, labId: 3 }).labId).toBe(3);
  expect(LAB_NEWS_FORMAT).toContain("Sumber: [Nama media], [link berita]");
  expect(LAB_NEWS_FORMAT).toContain("Hanya paragraf 1 yang memakai heading");
  expect(citesLink("Media https://www.a.com/x/", "https://a.com/x")).toBe(true);
  expect(citesLink("Media https://a.com/y", "https://a.com/x")).toBe(false);
});
