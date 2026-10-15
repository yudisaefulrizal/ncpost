import { describe, expect, it, vi } from "vitest";
import {
  ARTICLE_VARIABLES,
  DEFAULT_WEB_RESEARCH,
  articleVariables,
  configuredArticlePrompt,
  normalizeArticleConfig,
  normalizeDomain,
  normalizeWebResearch,
  researchErrors,
  researchRules,
  type ArticleConfig,
} from "../src/server/content-contract";
import { generateConfiguredArticle } from "../src/worker/configured-article";
import { DEFAULT_BOOK_SETTINGS } from "../src/server/book-settings";

const web: ArticleConfig = {
  source: "web",
  topicMode: "ai",
  context: "Berita teknologi",
  topic: "",
  material: "",
  paragraphCount: 3,
};
const research = {
  ...DEFAULT_WEB_RESEARCH,
  recency: "24h" as const,
  region: "Indonesia",
  preferred: ["https://www.Kompas.com/tekno", "detik.com"],
  excluded: ["contoh-hoaks.net"],
  minSources: 2,
};

describe("isian riset web", () => {
  it("nama situs dirapikan dari URL", () => {
    expect(normalizeDomain("https://www.Kompas.com/tekno?x=1")).toBe(
      "kompas.com",
    );
    expect(normalizeDomain("bukan situs")).toBeNull();
  });
  it("divalidasi dan disimpan di konfigurasi artikel", () => {
    const c = normalizeArticleConfig({ ...web, research });
    expect(c.research).toMatchObject({
      recency: "24h",
      preferred: ["kompas.com", "detik.com"],
      excluded: ["contoh-hoaks.net"],
      minSources: 2,
    });
    expect(normalizeArticleConfig(web).research).toBeUndefined();
  });
  it("isian tidak valid ditolak", () => {
    expect(() => normalizeWebResearch({ recency: "1y" })).toThrow();
    expect(() => normalizeWebResearch({ minSources: 0 })).toThrow();
    expect(() =>
      normalizeWebResearch({ preferred: ["bukan situs"] }),
    ).toThrow();
    expect(() =>
      normalizeWebResearch({ preferred: ["a.com"], excluded: ["a.com"] }),
    ).toThrow();
  });
});

describe("prompt riset web", () => {
  it("ketentuan hanya ditambahkan bila diaktifkan", () => {
    const off = configuredArticlePrompt("Tulis berita.", web);
    expect(off).not.toContain("Ketentuan riset web");
    const on = configuredArticlePrompt(
      "Tulis berita.",
      normalizeArticleConfig({ ...web, research }),
      false,
      web.context,
      "",
      ["Harga cabai turun"],
    );
    expect(on).toContain("24 jam terakhir");
    expect(on).toContain("kompas.com, detik.com");
    expect(on).toContain(
      "Jangan memakai situs berikut sebagai sumber: contoh-hoaks.net",
    );
    expect(on).toContain("minimal 2 sumber");
    expect(on).toContain("Harga cabai turun");
  });
  it("tanpa ketentuan khusus, tidak ada blok ketentuan kosong", () => {
    expect(
      researchRules({
        ...DEFAULT_WEB_RESEARCH,
        language: "",
        citeSources: false,
      }),
    ).toBe("");
  });
  it("variabel baru tersedia untuk prompt Lab", () => {
    const vars = articleVariables(
      normalizeArticleConfig({ ...web, research }),
      "",
      "",
      ["A", "B"],
    );
    expect(vars).toMatchObject({
      rentang_waktu: "24 jam terakhir",
      wilayah: "Indonesia",
      sumber_prioritas: "kompas.com, detik.com",
      sumber_dikecualikan: "contoh-hoaks.net",
      minimal_sumber: "2",
      topik_sebelumnya: "A; B",
    });
    for (const key of Object.keys(vars))
      expect(ARTICLE_VARIABLES).toHaveProperty(key);
  });
});

describe("pemeriksaan hasil", () => {
  it("sumber wajib ber-URL dan bukan situs yang dikecualikan", () => {
    const r = normalizeWebResearch(research);
    expect(researchErrors(r, "Kompas")).toEqual([
      "Sumber wajib dicantumkan dengan URL pada baris Sumber:",
    ]);
    expect(researchErrors(r, "https://m.contoh-hoaks.net/a")).toEqual([
      "Sumber dari situs yang dikecualikan: m.contoh-hoaks.net",
    ]);
    expect(researchErrors(r, "Kompas https://kompas.com/a")).toEqual([]);
    expect(researchErrors(undefined, "")).toEqual([]);
  });

  const article = (source: string) =>
    `# Judul\n\nSatu dua tiga. Empat lima.\n\nEnam tujuh. Delapan sembilan.\n\nSepuluh sebelas. Dua belas.\n\nSumber: ${source}`;
  const db = (titles: string[]) => {
    const queries: string[] = [];
    return {
      queries,
      async query(sql: string) {
        queries.push(sql);
        if (sql.includes("FROM lab_prompts"))
          return [
            [
              {
                id: 1,
                kind: "article",
                prompt: "Tulis berita {{rentang_waktu}}.",
                reference_key: null,
              },
            ],
          ];
        return [titles.map((title) => ({ title }))];
      },
    };
  };

  it("artikel tanpa URL sumber ditolak bila ketentuan aktif", async () => {
    const d = db([]);
    const settings = {
      ...DEFAULT_BOOK_SETTINGS,
      labPromptIds: [1],
      articleConfig: normalizeArticleConfig({ ...web, research }),
    };
    await expect(
      generateConfiguredArticle(
        d as any,
        settings,
        "news",
        "/tmp",
        "",
        "",
        vi.fn(async () => article("Kompas")),
        2,
      ),
    ).rejects.toThrow("Sumber wajib dicantumkan");
    const ok = await generateConfiguredArticle(
      d as any,
      settings,
      "news",
      "/tmp",
      "",
      "",
      vi.fn(async () => article("Kompas https://kompas.com/a")),
      2,
    );
    expect(ok.prompt).toContain("Tulis berita 24 jam terakhir.");
  });

  it("topik sebelumnya diambil dari jenis konten yang sama bila topik ditentukan AI", async () => {
    const d = db(["Harga cabai turun", "Banjir Jakarta"]);
    const settings = {
      ...DEFAULT_BOOK_SETTINGS,
      labPromptIds: [1],
      articleConfig: normalizeArticleConfig({ ...web, research }),
    };
    const r = await generateConfiguredArticle(
      d as any,
      settings,
      "news",
      "/tmp",
      "",
      "",
      vi.fn(async () => article("https://kompas.com/a")),
      2,
    );
    expect(r.prompt).toContain("Harga cabai turun; Banjir Jakarta");
    expect(d.queries.some((q) => q.includes("FROM news_articles"))).toBe(true);
  });

  it("tanpa ketentuan riset, perilaku lama tidak berubah", async () => {
    const d = db(["X"]);
    const settings = {
      ...DEFAULT_BOOK_SETTINGS,
      labPromptIds: [1],
      articleConfig: web,
    };
    const r = await generateConfiguredArticle(
      {
        query: async (sql: string) =>
          sql.includes("lab_prompts")
            ? [
                [
                  {
                    id: 1,
                    kind: "article",
                    prompt: "Tulis berita.",
                    reference_key: null,
                  },
                ],
              ]
            : d.query(sql),
      } as any,
      settings,
      "news",
      "/tmp",
      "",
      "",
      vi.fn(async () => article("Kompas")),
      2,
    );
    expect(r.prompt).not.toContain("Ketentuan riset web");
  });
});
