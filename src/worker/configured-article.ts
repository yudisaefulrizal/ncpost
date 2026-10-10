import { writeFileSync } from "node:fs";
import path from "node:path";
import { cliArgs, parseEvents, runCli } from "../server/providers";
import {
  configuredArticlePrompt,
  normalizeArticleConfig,
  validateUnifiedArticle,
  type ArticleConfig,
} from "../server/content-contract";
import type { BookSettings } from "../server/book-settings";
import type mysql from "mysql2/promise";
export function configuredCliArgs(source: ArticleConfig["source"]) {
  const args =
    source === "web"
      ? cliArgs.filter(
          (arg, i) =>
            arg !== "code_mode_host" &&
            !(arg === "--disable" && cliArgs[i + 1] === "code_mode_host"),
        )
      : [...cliArgs];
  return [
    ...(source === "web" ? ["--search"] : []),
    ...args,
    ...(source === "web" ? ["--enable", "code_mode_host"] : []),
    ...(process.env.CODEX_MODEL ? ["--model", process.env.CODEX_MODEL] : []),
    "-",
  ];
}
export async function runConfiguredModel(
  prompt: string,
  source: ArticleConfig["source"],
  work: string,
) {
  const raw = await runCli(
    process.env.CODEX_EXECUTABLE || "codex",
    configuredCliArgs(source),
    prompt,
    work,
    900000,
  );
  writeFileSync(path.join(work, "events.jsonl"), raw, { mode: 0o600 });
  if (
    source === "web" &&
    !raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .some(
        (e) =>
          e.type === "item.completed" &&
          ["web_search", "web_search_call"].includes(e.item?.type),
      )
  )
    throw Error("Riset web aktif tetapi tidak ada bukti pencarian web");
  return parseEvents(raw);
}
export async function generateConfiguredArticle(
  db: Pick<mysql.Pool, "query">,
  settings: BookSettings,
  engine: string,
  work: string,
  context = "",
  topic = "",
  generate = runConfiguredModel,
) {
  const config = normalizeArticleConfig(settings.articleConfig);
  if (config.source === "manual" && !config.material)
    throw Error("Bahan manual wajib diisi");
  const effectiveContext = config.context || context;
  const effectiveTopic =
    config.topicMode === "manual" ? config.topic || topic : "";
  if (config.topicMode === "manual" && !effectiveTopic)
    throw Error("Topik manual wajib diisi");
  const ids = settings.labPromptIds || [];
  if (!ids.length)
    throw Error("Aktifkan prompt Lab Artikel di Pengaturan Konten");
  const [rows]: any = await db.query(
    "SELECT * FROM lab_prompts WHERE id IN (?) ORDER BY id",
    [ids],
  );
  const candidates = rows.filter(
    (row: any) =>
      (row.kind === "article" ||
        (engine === "quote" && row.kind === "quote")) &&
      (!row.reference_key || row.reference_key === engine),
  );
  if (!candidates.length)
    throw Error("Prompt Lab Artikel yang sesuai belum diaktifkan");
  const row = candidates[Math.floor(Math.random() * candidates.length)];
  const prompt = configuredArticlePrompt(
    row.prompt,
    config,
    engine === "quote",
    effectiveContext,
    effectiveTopic,
  );
  const article = await generate(prompt, config.source, work);
  const parsed = validateUnifiedArticle(
    article,
    engine === "quote" ? 1 : config.paragraphCount,
    engine === "quote",
  );
  if (!parsed.ok) throw Error(parsed.errors.join("; "));
  return { article, parsed, prompt };
}
