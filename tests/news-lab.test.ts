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
  configuredArticlePrompt,
  LAB_NEWS_FORMAT,
  normalizeArticleConfig,
} from "../src/server/content-contract";
import {
  labArticle,
  parseJurnalisLink,
  runJurnalisTest,
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
  `# Judul\n\nIsi berita.\n\nSumber: Media ${link}\n\nTag: tekno`;
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

it("prompt Jurnalis meminta satu berita paling baru saat ini dari sumber lab", () => {
  const prompt = jurnalisPrompt(lab, ["https://theverge.com/lama"]);
  expect(prompt).toContain("Tema liputan: Teknologi");
  expect(prompt).toContain("paling baru terbit saat ini");
  expect(prompt).toContain("- https://dailysocial.id");
  expect(prompt).toContain("Pilih satu berita");
  expect(prompt).toContain("- https://theverge.com/lama");
  expect(parseJurnalisLink('```json\n{"link":"a"}\n```')).toBe("a");
  expect(() => parseJurnalisLink("tidak ada")).toThrow("JSON");
});

it("dipanggil produksi: satu berita terbaru dicatat lalu ditulis dengan prompt lab", async () => {
  const store = fakeStore();
  const link = "https://dailysocial.id/b";
  const generate = vi
    .fn()
    .mockResolvedValueOnce(JSON.stringify({ link }))
    .mockResolvedValueOnce(ARTICLE(link));
  const result = await labArticle(store, 7, 41, work, generate);
  expect(result.link).toBe(link);
  expect(result.article).toBe(ARTICLE(link));
  expect(generate.mock.calls[0][1]).toBe("web");
  expect(generate.mock.calls[1][0]).toContain(
    `Tulis artikel dari ${link} untuk tema Teknologi.`,
  );
  expect(generate.mock.calls[1][1]).toBe("lab");
  expect(store.use).toHaveBeenCalledWith(7, link, 41);
  expect(store.finish).toHaveBeenCalledWith(7, null);
});

it("percobaan ulang artikel memakai link yang sudah dipegang tanpa mencari lagi", async () => {
  const link = "https://dailysocial.id/lama";
  const store = fakeStore(lab, link);
  const generate = vi.fn().mockResolvedValue(ARTICLE(link));
  expect((await labArticle(store, 7, 41, work, generate)).link).toBe(link);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(generate.mock.calls[0][1]).toBe("lab");
  expect(store.use).not.toHaveBeenCalled();
});

it("lab nonaktif, berita di luar sumber, atau artikel tanpa link sumber digagalkan", async () => {
  await expect(
    labArticle(fakeStore({ ...lab, enabled: false }), 7, 41, work, vi.fn()),
  ).rejects.toThrow("nonaktif");
  const store = fakeStore();
  await expect(
    labArticle(
      store,
      7,
      41,
      work,
      vi.fn().mockResolvedValue('{"link":"https://lain.com/x"}'),
    ),
  ).rejects.toThrow("tidak menemukan berita baru");
  expect(store.use).not.toHaveBeenCalled();
  const link = "https://dailysocial.id/c";
  await expect(
    labArticle(
      fakeStore(),
      7,
      41,
      work,
      vi
        .fn()
        .mockResolvedValueOnce(JSON.stringify({ link }))
        .mockResolvedValueOnce(ARTICLE("https://dailysocial.id/lain")),
    ),
  ).rejects.toThrow("wajib mencantumkan link");
});

it("Tes menampilkan satu berita terbaru dan artikelnya tanpa mencatat", async () => {
  const store = fakeStore();
  const link = "https://dailysocial.id/a";
  await runJurnalisTest(
    store,
    lab,
    vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify({ link }))
      .mockResolvedValueOnce(ARTICLE(link)),
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

it("sumber Lab Berita wajib memilih lab dan menyisipkan link ke prompt", () => {
  const base = {
    source: "lab",
    topicMode: "ai",
    context: "",
    topic: "",
    material: "",
    paragraphCount: null,
  };
  expect(() => normalizeArticleConfig(base)).toThrow("Lab Berita");
  const config = normalizeArticleConfig({ ...base, labId: 3 });
  expect(config.labId).toBe(3);
  expect(() => configuredArticlePrompt("Tulis.", config)).toThrow(
    "Belum ada berita",
  );
  const prompt = configuredArticlePrompt(
    "Baca {{link_berita}}",
    config,
    false,
    "",
    "",
    [],
    "https://a.com/x",
  );
  expect(prompt).toContain("Baca https://a.com/x");
  expect(prompt).toContain("baris Sumber:\nhttps://a.com/x");
  expect(prompt).toContain(`Kontrak struktur hasil:\n${LAB_NEWS_FORMAT}`);
  expect(LAB_NEWS_FORMAT).toContain("Sumber: [Nama media], [link berita]");
  expect(LAB_NEWS_FORMAT).toContain("Hanya paragraf 1 yang memakai heading");
  expect(LAB_NEWS_FORMAT).toContain("maksimal lima tag");
  expect(LAB_NEWS_FORMAT).toContain("Tampilkan hanya artikel final");
  expect(citesLink("Media https://www.a.com/x/", "https://a.com/x")).toBe(true);
  expect(citesLink("Media https://a.com/y", "https://a.com/x")).toBe(false);
});
