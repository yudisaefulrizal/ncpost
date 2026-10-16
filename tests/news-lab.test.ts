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
  normalizeArticleConfig,
} from "../src/server/content-contract";
import {
  newsForArticle,
  parseJurnalisLinks,
  runJurnalisTest,
} from "../src/worker/jurnalis";
import { citesLink } from "../src/worker/configured-article";
import { outputRoot } from "../src/server/output-paths";

const lab: NewsLab = {
  id: 7,
  theme: "Teknologi",
  sources: ["https://www.theverge.com/tech", "https://dailysocial.id"],
  enabled: true,
  test: null,
  state: "idle",
  error: null,
  lastRunAt: null,
};
const work = path.join(outputRoot(), "jurnalis", "7");
afterEach(() => rmSync(work, { recursive: true, force: true }));

it("lab dinormalisasi: tema wajib, link sumber unik dan valid", () => {
  expect(
    normalizeNewsLab({
      theme: " Teknologi ",
      sources: ["theverge.com/tech", "https://theverge.com/tech/", ""],
    }),
  ).toEqual({ theme: "Teknologi", sources: ["https://theverge.com/tech"] });
  expect(() => normalizeNewsLab({ theme: "", sources: ["a.com"] })).toThrow(
    "Tema",
  );
  expect(() => normalizeNewsLab({ theme: "T", sources: [] })).toThrow(
    "minimal satu",
  );
  expect(() =>
    normalizeNewsLab({ theme: "T", sources: ["bukan link"] }),
  ).toThrow("bukan link");
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

it("prompt Jurnalis meminta berita paling baru saat ini dari sumber lab", () => {
  const prompt = jurnalisPrompt(lab, ["https://theverge.com/lama"]);
  expect(prompt).toContain("Tema liputan: Teknologi");
  expect(prompt).toContain("paling baru terbit saat ini");
  expect(prompt).toContain("- https://dailysocial.id");
  expect(prompt).toContain("urutkan dari yang paling baru");
  expect(prompt).toContain("- https://theverge.com/lama");
  expect(parseJurnalisLinks('```json\n{"links":["a"]}\n```')).toEqual(["a"]);
  expect(() => parseJurnalisLinks("tidak ada")).toThrow("JSON");
});

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

it("dipanggil produksi: berita terbaru pertama yang valid dipakai dan dicatat", async () => {
  const store = fakeStore();
  const generate = vi.fn().mockResolvedValue(
    JSON.stringify({
      links: [
        "https://lain.com/x",
        "https://dailysocial.id/b",
        "https://dailysocial.id/c",
      ],
    }),
  );
  expect(await newsForArticle(store, 7, 41, work, generate)).toBe(
    "https://dailysocial.id/b",
  );
  expect(store.working).toHaveBeenCalledWith(7);
  expect(store.use).toHaveBeenCalledWith(7, "https://dailysocial.id/b", 41);
  expect(store.finish).toHaveBeenCalledWith(7, null);
});

it("percobaan ulang artikel memakai link yang sudah dipegang tanpa mencari lagi", async () => {
  const store = fakeStore(lab, "https://dailysocial.id/lama");
  const generate = vi.fn();
  expect(await newsForArticle(store, 7, 41, work, generate)).toBe(
    "https://dailysocial.id/lama",
  );
  expect(generate).not.toHaveBeenCalled();
});

it("lab nonaktif atau tanpa berita baru menggagalkan pemanggilan", async () => {
  await expect(
    newsForArticle(fakeStore({ ...lab, enabled: false }), 7, 41, work, vi.fn()),
  ).rejects.toThrow("nonaktif");
  const store = fakeStore();
  await expect(
    newsForArticle(
      store,
      7,
      41,
      work,
      vi.fn().mockResolvedValue('{"links":["https://lain.com/x"]}'),
    ),
  ).rejects.toThrow("tidak menemukan berita baru");
  expect(store.use).not.toHaveBeenCalled();
  expect(store.finish).toHaveBeenCalledWith(
    7,
    expect.stringContaining("tidak menemukan"),
  );
});

it("Tes menampilkan berita terbaru yang ditemukan tanpa mencatatnya", async () => {
  const store = fakeStore();
  await runJurnalisTest(
    store,
    lab,
    vi
      .fn()
      .mockResolvedValue(
        '{"links":["https://dailysocial.id/a","https://lain.com/b"]}',
      ),
    125,
  );
  expect(store.use).not.toHaveBeenCalled();
  expect(store.finishTest).toHaveBeenCalledWith(
    7,
    ["https://dailysocial.id/a"],
    null,
  );
  await runJurnalisTest(store, lab, vi.fn().mockRejectedValue(Error("x")), 126);
  expect(store.finishTest).toHaveBeenLastCalledWith(7, [], "x");
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
  expect(citesLink("Media https://www.a.com/x/", "https://a.com/x")).toBe(true);
  expect(citesLink("Media https://a.com/y", "https://a.com/x")).toBe(false);
});
