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
  jurnalisCliArgs,
  labArticle,
  runJurnalisTest,
  type JurnalisCall,
} from "../src/worker/jurnalis";
import { citesLink } from "../src/worker/configured-article";
import { outputRoot } from "../src/server/output-paths";
import {
  extractNewsText,
  fetchNewsText,
  NewsUnreachable,
  type NewsText,
} from "../src/server/news-fetch";

const lab: NewsLab = {
  id: 7,
  theme: "Teknologi",
  sources: ["https://www.theverge.com/tech", "https://dailysocial.id"],
  prompt: "Tulis empat paragraf dengan bahasa santai.",
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
  ).toThrow("placeholder");
  expect(() =>
    normalizeNewsLab({
      theme: "T",
      sources: ["a.com"],
      prompt: "Baca {{link_berita}}",
    }),
  ).toThrow("dikirim otomatis");
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
const OK = (link: string) => JSON.stringify({ article: ARTICLE(link) });
const fakeStore = (current: NewsLab = lab, held: string | null = null) =>
  ({
    get: vi.fn().mockResolvedValue(current),
    held: vi.fn().mockResolvedValue(held),
    usedUrls: vi.fn().mockResolvedValue([]),
    usedHashes: vi.fn().mockResolvedValue(new Set()),
    use: vi.fn(),
    release: vi.fn(),
    working: vi.fn(),
    finish: vi.fn(),
    finishTest: vi.fn(),
  }) as unknown as NewsLabStore & Record<string, any>;
/** Model palsu: jawaban per langkah (search, article, format); daftar = berurutan. */
const fakeModel = (answers: Partial<Record<string, string | string[]>>) =>
  vi.fn(async (call: JurnalisCall) => {
    const value = answers[call.name];
    const answer = Array.isArray(value) ? value.shift() : value;
    if (answer === undefined) throw Error(`tak terduga: ${call.name}`);
    return answer;
  });
/** Unduhan palsu: link di `blocked` gagal, lainnya mengembalikan isi berita. */
const fakeFetch = (...blocked: string[]) =>
  vi.fn(async (url: string): Promise<NewsText> => {
    if (blocked.includes(url)) throw new NewsUnreachable(`HTTP 403: ${url}`);
    return {
      url,
      title: "Judul asli",
      siteName: "Media",
      published: "2026-10-16",
      text: "Isi lengkap berita dari media sumber.",
    };
  });

it("teks utama berita diambil dari HTML; halaman tanpa isi dianggap tidak bisa diakses", async () => {
  const body = "Paragraf berita yang cukup panjang untuk dibaca. ".repeat(20);
  const html = `<html><head><title>Judul</title><meta property="article:published_time" content="2026-10-16"></head><body><nav>Menu</nav><article><h1>Judul Berita</h1><p>${body}</p><p>${body}</p></article></body></html>`;
  const news = extractNewsText(html, "https://a.com/x");
  expect(news.text).toContain("Paragraf berita yang cukup panjang");
  expect(news.published).toBe("2026-10-16");
  expect(() =>
    extractNewsText(
      "<html><body><p>Berlangganan</p></body></html>",
      "https://a.com/y",
    ),
  ).toThrow(NewsUnreachable);
  const res = (status: number, text = html, type = "text/html") =>
    vi.fn(
      async () =>
        new Response(text, { status, headers: { "content-type": type } }),
    ) as unknown as typeof fetch;
  expect((await fetchNewsText("https://a.com/x", res(200))).text).toContain(
    "Paragraf berita",
  );
  await expect(fetchNewsText("https://a.com/x", res(403))).rejects.toThrow(
    "HTTP 403",
  );
  await expect(
    fetchNewsText("https://a.com/x", res(200, "%PDF", "application/pdf")),
  ).rejects.toThrow("bukan HTML");
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
      name: "search",
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
});

it("dipanggil produksi: link dicatat, isi diunduh aplikasi, artikel ditulis tanpa web dari bahan itu", async () => {
  const store = fakeStore();
  const link = "https://dailysocial.id/b";
  const model = fakeModel({
    search: JSON.stringify({ link }),
    article: OK(link),
  });
  const fetchText = fakeFetch();
  const result = await labArticle(store, 7, 41, work, model, fetchText);
  expect(result.link).toBe(link);
  expect(result.article).toBe(ARTICLE(link));
  expect(fetchText).toHaveBeenCalledWith(link);
  const [searchCall, articleCall] = model.mock.calls.map((c) => c[0]);
  expect(searchCall).toMatchObject({ name: "search", search: true });
  // Prompt lab dikirim apa adanya; bahan, link, dan tema lewat instruksi runtime.
  expect(articleCall.prompt).toBe(lab.prompt);
  expect(articleCall).toMatchObject({
    search: false,
    schema: expect.any(Object),
  });
  expect(articleCall.instructions).toContain(
    "Jangan menggunakan tool, shell, file, atau web",
  );
  expect(articleCall.instructions).toContain(
    "Isi lengkap berita dari media sumber.",
  );
  expect(articleCall.instructions).toContain(link);
  expect(articleCall.instructions).toContain("tema lab: Teknologi");
  expect(articleCall.instructions).toContain(LAB_NEWS_FORMAT);
  expect(store.use).toHaveBeenCalledWith(7, link, 41);
  expect(store.finish).toHaveBeenCalledWith(7, null);
});

it("format rusak diperbaiki sekali tanpa web lalu dicek ulang", async () => {
  const link = "https://dailysocial.id/f";
  // Isi ada, tetapi judul tanpa # dan Sumber tanpa link.
  const model = fakeModel({
    search: JSON.stringify({ link }),
    article: JSON.stringify({
      article: "Judul\n\nIsi berita.\n\nSumber: Media\n\nTag: tekno",
    }),
    format: ARTICLE(link),
  });
  const result = await labArticle(fakeStore(), 7, 41, work, model, fakeFetch());
  expect(result.article).toBe(ARTICLE(link));
  const fix = model.mock.calls[2][0];
  expect(fix).toMatchObject({ name: "format", search: false });
  expect(fix.prompt).toContain("Perbaiki HANYA format");
  expect(fix.prompt).toContain("Judul wajib di awal");
  const broken = fakeModel({
    search: JSON.stringify({ link }),
    article: JSON.stringify({ article: "Judul\n\nIsi berita." }),
    format: "masih bukan artikel",
  });
  await expect(
    labArticle(fakeStore(), 7, 41, work, broken, fakeFetch()),
  ).rejects.toThrow("Format artikel tetap rusak");
});

it("link yang gagal diunduh dilepas lalu Jurnalis mencari berita lain", async () => {
  const store = fakeStore();
  const [a, b] = ["https://dailysocial.id/a", "https://dailysocial.id/b"];
  const model = fakeModel({
    search: [JSON.stringify({ link: a }), JSON.stringify({ link: b })],
    article: OK(b),
  });
  const result = await labArticle(store, 7, 41, work, model, fakeFetch(a));
  expect(result.link).toBe(b);
  expect(store.release).toHaveBeenCalledWith(41, a);
  expect(store.use).toHaveBeenNthCalledWith(1, 7, a, 41);
  expect(store.use).toHaveBeenNthCalledWith(2, 7, b, 41);
  // Pencarian kedua diminta menghindari link yang gagal; penulis tak dipanggil untuk a.
  expect(model.mock.calls.map((c) => c[0].name)).toEqual([
    "search",
    "search",
    "article",
  ]);
  expect(model.mock.calls[1][0].prompt).toContain(`- ${a}`);
  expect(model.mock.calls[1][0].work).toBe(path.join(work, "percobaan-2"));
});

it("tiga berita berturut-turut gagal diunduh menggagalkan artikel", async () => {
  const store = fakeStore();
  const links = [1, 2, 3].map((n) => `https://dailysocial.id/${n}`);
  const model = fakeModel({
    search: links.map((link) => JSON.stringify({ link })),
  });
  await expect(
    labArticle(store, 7, 41, work, model, fakeFetch(...links)),
  ).rejects.toThrow("3 berita berturut-turut tidak bisa diakses");
  expect(store.release).toHaveBeenCalledTimes(3);
  expect(store.finish).toHaveBeenLastCalledWith(
    7,
    expect.stringContaining("tidak bisa diakses"),
  );
});

it("link yang dipegang tapi gagal diunduh diganti berita baru", async () => {
  const held = "https://dailysocial.id/lama";
  const fresh = "https://dailysocial.id/baru";
  const store = fakeStore(lab, held);
  const model = fakeModel({
    search: JSON.stringify({ link: fresh }),
    article: OK(fresh),
  });
  expect(
    (await labArticle(store, 7, 41, work, model, fakeFetch(held))).link,
  ).toBe(fresh);
  expect(store.release).toHaveBeenCalledWith(41, held);
  expect(store.use).toHaveBeenCalledWith(7, fresh, 41);
});

it("jawaban tanpa paragraf isi tidak diperbaiki agar isi tidak dikarang", async () => {
  const link = "https://dailysocial.id/n";
  const model = fakeModel({
    search: JSON.stringify({ link }),
    article: JSON.stringify({ article: "Saya sudah membaca beritanya." }),
  });
  await expect(
    labArticle(fakeStore(), 7, 41, work, model, fakeFetch()),
  ).rejects.toThrow("bukan artikel");
  expect(model.mock.calls.map((c) => c[0].name)).toEqual(["search", "article"]);
});

it("percobaan ulang artikel memakai link yang sudah dipegang tanpa mencari lagi", async () => {
  const link = "https://dailysocial.id/lama";
  const store = fakeStore(lab, link);
  const model = fakeModel({ article: OK(link) });
  expect((await labArticle(store, 7, 41, work, model, fakeFetch())).link).toBe(
    link,
  );
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
      fakeFetch(),
    ),
  ).rejects.toThrow("tidak menemukan berita baru");
  expect(store.use).not.toHaveBeenCalled();
});

it("Tes mencari berita lain bila link gagal diunduh, tanpa mencatat", async () => {
  const store = fakeStore();
  const [a, b] = ["https://dailysocial.id/a", "https://dailysocial.id/b"];
  await runJurnalisTest(
    store,
    lab,
    fakeModel({
      search: [JSON.stringify({ link: a }), JSON.stringify({ link: b })],
      article: OK(b),
    }),
    127,
    fakeFetch(a),
  );
  expect(store.use).not.toHaveBeenCalled();
  expect(store.release).not.toHaveBeenCalled();
  expect(store.finishTest).toHaveBeenCalledWith(7, {
    links: [b],
    article: ARTICLE(b),
    error: null,
  });
});

it("Tes menampilkan satu berita terbaru dan artikelnya tanpa mencatat", async () => {
  const store = fakeStore();
  const link = "https://dailysocial.id/a";
  await runJurnalisTest(
    store,
    lab,
    fakeModel({ search: JSON.stringify({ link }), article: OK(link) }),
    125,
    fakeFetch(),
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
