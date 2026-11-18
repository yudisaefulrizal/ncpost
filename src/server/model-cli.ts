import { runCli } from "./providers";
import { getAiProvider } from "./ai-provider";
import {
  AGY_EXECUTABLE,
  agyArgs,
  agyInput,
  agyOptionsFromCodexArgs,
  agyToCodexEvents,
} from "./agy";
/**
 * Satu pintu untuk semua pemanggilan teks. Pemanggil membangun argumen Codex;
 * bila penyedia agy dipilih, opsi (search, schema, instruksi) diturunkan darinya
 * dan hasilnya dikembalikan sebagai JSONL gaya Codex.
 */
export async function runModelCli(
  codexArgs: string[],
  prompt: string,
  cwd: string,
  timeout = 180000,
) {
  if ((await getAiProvider()) !== "agy")
    return runCli(
      process.env.CODEX_EXECUTABLE || "codex",
      codexArgs,
      prompt,
      cwd,
      timeout,
    );
  const opts = agyOptionsFromCodexArgs(codexArgs);
  const raw = await runCli(
    AGY_EXECUTABLE(),
    agyArgs(opts),
    agyInput(opts.instructions ? `${opts.instructions}\n\n${prompt}` : prompt),
    cwd,
    timeout,
  );
  return agyToCodexEvents(raw);
}
