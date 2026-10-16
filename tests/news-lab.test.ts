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
import { parseJurnalisLinks, runJurnalis } from "../src/worker/jurnalis";
import { citesLink } from "../src/worker/configured-article";
import { outputRoot } from "../src/server/output-paths";

const lab: NewsLab = {
  id: 7,
  theme: "Teknologi",
  sources: ["https://www.theverge.com/tech", "https://dailysocial.id"],
  dailyTarget: 3,
  state: "running",
  error: null,
  lastRunAt: 1,
  today: 1,
  pending: 0,
};
afterEach(() =>
  rmSync(path.join(outputRoot(), "jurnalis", "7"), {
    recursive: true,
    force: true,
  }),
);

it("lab dinormalisasi: tema wajib, link sumber unik, target 0–50", () => {
  expect(
    normalizeNewsLab({
      theme: " Teknologi ",
      sources: ["theverge.com/tech", "https://theverge.com/tech/", ""],
      dailyTarget: 2,
    }),
  ).toEqual({
    theme: "Teknologi",
    sources: ["https://theverge.com/tech"],
    dailyTarget: 2,
  });
  expect(() =>
    normalizeNewsLab({ theme: "", sources: ["a.com"], dailyTarget: 1 }),
  ).toThrow("Tema");
  expect(() =>
    normalizeNewsLab({ theme: "T", sources: [], dailyTarget: 1 }),
  ).toThrow("minimal satu");
  expect(() =>
    normalizeNewsLab({ theme: "T", sources: ["a.com"], dailyTarget: 51 }),
  ).toThrow("Target");
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

it("prompt Jurnalis memuat tema, sumber, jumlah, dan link terpakai", () => {
  const prompt = jurnalisPrompt(lab, 2, ["https://theverge.com/lama"]);
  expect(prompt).toContain("Tema liputan: Teknologi");
  expect(prompt).toContain("- https://dailysocial.id");
  expect(prompt).toContain("Pilih 2 berita");
  expect(prompt).toContain("- https://theverge.com/lama");
  expect(parseJurnalisLinks('```json\n{"links":["a"]}\n```')).toEqual(["a"]);
  expect(() => parseJurnalisLinks("tidak ada")).toThrow("JSON");
});

const fakeStore = () =>
  ({
    usedUrls: vi.fn().mockResolvedValue([]),
    usedHashes: vi.fn().mockResolvedValue(new Set()),
    record: vi.fn(async (_: number, urls: string[]) => urls.length),
    finish: vi.fn(),
  }) as unknown as NewsLabStore & Record<string, any>;

it("Jurnalis mencatat link valid sampai sisa target hari ini", async () => {
  const store = fakeStore();
  const generate = vi.fn().mockResolvedValue(
    JSON.stringify({
      links: [
        "https://theverge.com/news/a",
        "https://dailysocial.id/b",
        "https://dailysocial.id/c",
      ],
    }),
  );
  await runJurnalis(store, lab, generate, 123);
  expect(generate).toHaveBeenCalledWith(
    expect.stringContaining("Pilih 2 berita"),
    "web",
    expect.any(String),
  );
  expect(store.record).toHaveBeenCalledWith(7, [
    "https://theverge.com/news/a",
    "https://dailysocial.id/b",
  ]);
  expect(store.finish).toHaveBeenCalledWith(7, null);
});

it("Jurnalis tanpa link baru dicatat gagal", async () => {
  const store = fakeStore();
  await runJurnalis(
    store,
    lab,
    vi.fn().mockResolvedValue('{"links":["https://lain.com/x"]}'),
    124,
  );
  expect(store.record).toHaveBeenCalledWith(7, []);
  expect(store.finish).toHaveBeenCalledWith(
    7,
    expect.stringContaining("tidak menemukan berita baru"),
  );
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
