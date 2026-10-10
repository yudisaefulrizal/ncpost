import { generateConfiguredArticle } from "./configured-article";
import { NewsMediaStore } from "../server/news-media-store";
import { productionLabPrompt } from "../server/lab-production";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "../server/config";
import { cliArgs, parseEvents, runCli } from "../server/providers";
import {
  newsArticlePrompt,
  type NewsResult,
  validateNewsResult,
} from "../server/news";
import { NewsStore, type NewsArticle } from "../server/news-store";
export const NEWS_SCHEMA_PATH = path.join(
  ROOT,
  "prompts/berita/output.schema.json",
);
// Explain the application transport separately; keep the Hermes prompt intact.
export const NEWS_RUNTIME_INSTRUCTIONS = `Integrasi runtime ncpost: kerjakan seluruh riset dan penulisan sesuai prompt pengguna. Keluaran akhir wajib berupa objek JSON sesuai output schema. Field article berisi artikel Markdown final lengkap, bukan ringkasan atau pesan proses.
Sesi model memakai filesystem read-only. Aplikasi host akan menyimpan candidate_topics, article_plan, claim_source_map, dan article_validation sebagai berkas JSON bernama sama di direktori run kanonis, serta article sebagai article.md. Pengembalian seluruh field audit yang lengkap adalah cara menyerahkan berkas kepada host; tidak perlu menulis berkas melalui tool. Nilai gate ketersediaan berkas audit berdasarkan kelengkapan data yang diserahkan untuk disimpan host. Jangan menahan artikel hanya karena model tidak dapat menulis filesystem.
Aplikasi host memeriksa dua kalimat lengkap per paragraf serta format sebelum menerima hasil; hitungan kata dan karakter hanya informasi audit, bukan batas kelulusan. Jangan mengklaim menjalankan alat lokal jika tidak dilakukan. Semua pemeriksaan fakta tetap wajib dilakukan menggunakan riset web; jangan menyatakan lolos jika fakta atau data audit belum lengkap.

${readFileSync(path.join(ROOT, "prompts/berita/format.md"), "utf8")}`;
export function newsCliArgs(model = process.env.CODEX_MODEL) {
  // Web search executes through Code Mode in current Codex versions. Keep
  // the book provider's restrictions, but do not disable this tool host.
  const researchArgs = cliArgs.filter(
    (arg, i) =>
      arg !== "code_mode_host" &&
      !(arg === "--disable" && cliArgs[i + 1] === "code_mode_host"),
  );
  return [
    "--search",
    ...researchArgs,
    "--enable",
    "code_mode_host",
    "-c",
    `developer_instructions=${JSON.stringify(NEWS_RUNTIME_INSTRUCTIONS)}`,
    "--output-schema",
    NEWS_SCHEMA_PATH,
    ...(model ? ["--model", model] : []),
    "-",
  ];
}
export function parseNewsResearch(raw: string) {
  const result: NewsResult = JSON.parse(parseEvents(raw));
  const research = raw
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l))
    .filter(
      (e) =>
        e.type === "item.completed" &&
        ["web_search", "web_search_call"].includes(e.item?.type),
    )
    .map((e) => e.item);
  if (!research.length)
    throw Error(
      "Pembuatan berita tidak memiliki bukti pencarian web; artikel ditolak",
    );
  const validation = validateNewsResult(result);
  return { result, research, validation };
}
export async function runNewsJob(store: NewsStore, j: NewsArticle) {
  // A unique attempt directory prevents lease-recovery results overwriting newer runs.
  const dir = path.join(
    ROOT,
    "output/berita",
    String(j.id),
    String(j.attempts),
  );
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const heartbeat = setInterval(
    () => store.heartbeat(j).catch(() => {}),
    60000,
  );
  try {
    const settings = await new NewsMediaStore(store.db).settings(
      j.category,
      store.db,
      j.content_type_id ?? 2,
    );
    if (settings.articleConfig) {
      const generated = await generateConfiguredArticle(
        store.db,
        settings,
        "news",
        dir,
      );
      const sourceUrl =
        /https:\/\/[^\s)]+/.exec(generated.parsed.source)?.[0] || "";
      const result: NewsResult = {
        article: generated.article,
        article_config: settings.articleConfig,
        candidate_topics: sourceUrl
          ? [
              {
                source: generated.parsed.source,
                url: sourceUrl,
                original_title: generated.parsed.title,
                summary: "",
                selected: true,
                reason: "",
              },
            ]
          : [],
        article_plan: {
          title: generated.parsed.title,
          sections: generated.parsed.paragraphs.map((p) => ({
            heading: generated.parsed.heading,
            summary: p,
          })),
        },
        claim_source_map: [],
        article_validation: { checks: [] },
      };
      writeFileSync(path.join(dir, "prompt.md"), generated.prompt, {
        mode: 0o600,
      });
      writeFileSync(path.join(dir, "article.md"), generated.article, {
        mode: 0o600,
      });
      await store.complete(j, result, {
        configured: true,
        source: settings.articleConfig.source,
      });
      return;
    }
    const lab = await productionLabPrompt(store.db, settings, "news", {
      buku: "",
      bab: "",
      teks: "",
      artikel: "",
      quote: "",
    });
    const prompt = lab?.prompt || newsArticlePrompt();
    writeFileSync(path.join(dir, "prompt.md"), prompt, { mode: 0o600 });
    const raw = await runCli(
      process.env.CODEX_EXECUTABLE || "codex",
      newsCliArgs(),
      prompt,
      dir,
      900000,
    );
    writeFileSync(path.join(dir, "events.jsonl"), raw, { mode: 0o600 });
    // Save raw final output before validation so failures can be inspected and retried explicitly.
    writeFileSync(path.join(dir, "response.json"), parseEvents(raw), {
      mode: 0o600,
    });
    const { result, research, validation } = parseNewsResearch(raw);
    const artifacts = {
      ...result,
      validation,
      research,
      promptSha256: createHash("sha256").update(prompt).digest("hex"),
    };
    for (const [name, value] of Object.entries({
      "candidate_topics.json": result.candidate_topics,
      "article_plan.json": result.article_plan,
      "claim_source_map.json": result.claim_source_map,
      "article_validation.json": {
        ...result.article_validation,
        structural: validation,
      },
      "research.json": research,
    }))
      writeFileSync(
        path.join(dir, name),
        JSON.stringify(value, null, 2) + "\n",
        { mode: 0o600 },
      );
    writeFileSync(path.join(dir, "article.md"), result.article, {
      mode: 0o600,
    });
    await store.complete(j, result, artifacts);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Pembuatan artikel berita gagal";
    writeFileSync(
      path.join(dir, "failure.json"),
      JSON.stringify({ error: message }, null, 2),
      { mode: 0o600 },
    );
    await store.fail(j, message);
  } finally {
    clearInterval(heartbeat);
  }
}
