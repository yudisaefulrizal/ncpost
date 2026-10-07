import { newsFixture } from "./fixtures/news";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  newsArticlePrompt,
  newsSourceKey,
  validateNewsArticle,
  validateNewsResult,
} from "../src/server/news";
import {
  newsCliArgs,
  parseNewsResearch,
  NEWS_RUNTIME_INSTRUCTIONS,
} from "../src/worker/news";

it("prompt berita tetap byte-for-byte sama dengan sumber Hermes yang diimpor", () => {
  expect(createHash("sha256").update(newsArticlePrompt()).digest("hex")).toBe(
    "532f30e102d536923a53efeaea747ef98a6aa41835ff3817343eba4dd81afca0",
  );
  expect(newsArticlePrompt()).toContain("tepat 6 bagian isi"); // source preserved, including legacy wording
});
it("artikel berita memakai judul teks biasa dan empat paragraf tanpa header dengan batas kata tetap", () => {
  const result = validateNewsArticle(newsFixture().article);
  expect(result).toMatchObject({
    ok: true,
    wordCount: 80,
    counts: [20, 20, 20, 20],
    title: "Kabar teknologi baru",
    headings: [],
  });
  expect(
    validateNewsArticle(
      newsFixture().article.replace("\n\n", "\n\n## Bagian 1\n\n"),
    ).ok,
  ).toBe(false);
  expect(
    validateNewsArticle(newsFixture().article.replace("kata20.", "")).ok,
  ).toBe(false);
  expect(
    validateNewsArticle(
      newsFixture().article.replace(
        "Kabar teknologi baru",
        "Mengapa perangkat berubah",
      ),
    ).ok,
  ).toBe(false);
  expect(validateNewsArticle("# " + newsFixture().article).ok).toBe(false);
  expect(
    validateNewsArticle(newsFixture().article + "\n\nCatatan tambahan").ok,
  ).toBe(false);
});
it("domain sumber bukan sekadar kecocokan substring", () => {
  expect(
    newsSourceKey("https://www.theguardian.com/technology/test#ref"),
  ).toEqual({
    host: "theguardian.com",
    url: "https://theguardian.com/technology/test",
  });
  for (const url of [
    "https://theguardian.com.evil.test/news",
    "https://evil.test/?source=theguardian.com",
    "https://user:pass@theguardian.com/news",
    "http://theguardian.com/news",
  ])
    expect(() => newsSourceKey(url)).toThrow();
});
it("wajib tiga sumber berbeda, satu kandidat terpilih, sumber artikel cocok dan seluruh gate lolos", () => {
  expect(validateNewsResult(newsFixture()).ok).toBe(true);
  let r = newsFixture();
  r.candidate_topics[2].url = r.candidate_topics[0].url;
  expect(() => validateNewsResult(r)).toThrow("berbeda");
  r = newsFixture();
  r.candidate_topics[0].selected = true;
  expect(() => validateNewsResult(r)).toThrow("satu kandidat");
  r = newsFixture();
  r.claim_source_map[0].source_url = r.candidate_topics[0].url;
  expect(() => validateNewsResult(r)).toThrow("Peta klaim");
  r = newsFixture();
  r.article_validation.checks[2].passed = false;
  expect(() => validateNewsResult(r)).toThrow("Sebelas");
});
it("runner mengaktifkan live web search dan schema tanpa mengubah prompt", () => {
  const args = newsCliArgs("model-uji");
  expect(args.slice(0, 2)).toEqual(["--search", "exec"]);
  expect(args).toContain("read-only");
  expect(args).toContain("--output-schema");
  expect(args).toContain(
    `developer_instructions=${JSON.stringify(NEWS_RUNTIME_INSTRUCTIONS)}`,
  );
  expect(args[args.indexOf("code_mode_host") - 1]).toBe("--enable");
  expect(args.filter((arg) => arg === "code_mode_host")).toHaveLength(1);
  expect(args[args.indexOf("browser_use") - 1]).toBe("--disable");
  expect(args[args.indexOf("unified_exec") - 1]).toBe("--disable");
  expect(args.slice(-3)).toEqual(["--model", "model-uji", "-"]);
});
it("artikel kosong melaporkan alasan gate provider tanpa menampilkan semua kesalahan format", () => {
  const result = newsFixture();
  result.article = "";
  result.article_validation.checks[10] = {
    id: "11",
    passed: false,
    notes: "Filesystem hanya mengizinkan pembacaan; artikel final ditahan.",
  };
  expect(() => validateNewsResult(result)).toThrow(
    "Provider tidak menghasilkan artikel: Filesystem hanya mengizinkan pembacaan",
  );
  expect(() => validateNewsResult(result)).not.toThrow("Satu judul teks biasa");
});
it("hasil tanpa pencarian web nyata ditolak meskipun model mengklaim valid", () => {
  const final = {
    type: "item.completed",
    item: { type: "agent_message", text: JSON.stringify(newsFixture()) },
  };
  expect(() => parseNewsResearch(JSON.stringify(final))).toThrow(
    "bukti pencarian web",
  );
  const raw = [
    {
      type: "item.completed",
      item: {
        type: "web_search",
        action: {
          type: "open_page",
          url: "https://www.theguardian.com/technology/test",
        },
      },
    },
    final,
  ]
    .map((e) => JSON.stringify(e))
    .join("\n");
  expect(parseNewsResearch(raw).validation.ok).toBe(true);
});
