import { readFileSync, existsSync } from "node:fs";
import { readdir, lstat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
// Adapter agy (Antigravity CLI). Keluaran stream-json diubah menjadi event
// berformat Codex agar parseEvents, bukti web search, dan events.jsonl tetap sama.

export const AGY_EXECUTABLE = () => process.env.AGY_EXECUTABLE || "agy";

/** Opsi pemanggilan yang diturunkan dari argumen Codex yang sudah dibangun pemanggil. */
export function agyOptionsFromCodexArgs(args: string[]) {
  const value = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const prefix = "developer_instructions=";
  const instruction = args
    .map((a, i) => (args[i - 1] === "-c" && a.startsWith(prefix) ? a : null))
    .find((a): a is string => !!a);
  const schemaPath = value("--output-schema");
  return {
    search: args.includes("--search"),
    instructions: instruction
      ? (JSON.parse(instruction.slice(prefix.length)) as string)
      : undefined,
    schema: schemaPath ? readFileSync(schemaPath, "utf8") : undefined,
  };
}

export function agyArgs(opts: { schema?: string }) {
  return [
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    ...(opts.schema ? ["--json-schema", opts.schema] : []),
    ...(process.env.AGY_MODEL ? ["--model", process.env.AGY_MODEL] : []),
  ];
}
// Prompt panjang dikirim lewat stdin (argumen CLI dibatasi ±128 KB).
export const agyInput = (prompt: string) =>
  JSON.stringify({ event: "user", message: { content: prompt } }) + "\n";

function parseLines(raw: string) {
  return raw
    .trim()
    .split("\n")
    .filter((x) => x.trim())
    .map((x) => JSON.parse(x));
}
export function agyResult(raw: string) {
  const result = parseLines(raw).findLast((e) => e.event === "result")?.result;
  if (!result) throw Error("agy tidak mengembalikan hasil");
  if (result.status !== "SUCCESS")
    throw Error(
      `agy gagal: ${String(result.error || result.status).slice(0, 300)}`,
    );
  return result as {
    conversation_id: string;
    response: string;
    structured_output?: unknown;
  };
}
/** stream-json agy → JSONL gaya Codex (thread, web_search, agent_message). */
export function agyToCodexEvents(raw: string) {
  const result = agyResult(raw);
  const searched = new Set<number>();
  for (const e of parseLines(raw)) {
    const s = e.step_update;
    if (s?.tool_name === "search_web" && typeof s.step_index === "number")
      searched.add(s.step_index);
  }
  const text =
    result.structured_output !== undefined && result.structured_output !== null
      ? JSON.stringify(result.structured_output)
      : String(result.response ?? "").trim();
  return [
    { type: "thread.started", thread_id: result.conversation_id },
    ...[...searched].map(() => ({
      type: "item.completed",
      item: { type: "web_search", query: "" },
    })),
    { type: "item.completed", item: { type: "agent_message", text } },
    { type: "turn.completed" },
  ]
    .map((e) => JSON.stringify(e))
    .join("\n");
}

export function agyBrainRoot(home = process.env.HOME || os.homedir()) {
  return path.join(home, ".gemini/antigravity-cli/brain");
}
/** Id percakapan agy (induk dan subagen) dari stream-json. */
export function agyConversations(raw: string) {
  const ids = new Set<string>();
  for (const e of parseLines(raw)) {
    const s = e.step_update ?? e.result;
    if (typeof s?.conversation_id === "string") ids.add(s.conversation_id);
    for (const sub of s?.subagent_info?.subagents ?? [])
      if (typeof sub?.conversation_id === "string")
        ids.add(sub.conversation_id);
  }
  return [...ids].filter((id) => /^[-a-f0-9]{36}$/.test(id));
}
/** Gambar baru (JPG/PNG tidak kosong, dibuat setelah startedAt) di folder percakapan agy. */
export async function agyImageCandidates(
  raw: string,
  opts: { home: string; startedAt: number },
) {
  const root = agyBrainRoot(opts.home);
  const found: string[] = [];
  let stale = 0,
    empty = 0;
  for (const id of agyConversations(raw)) {
    const dir = path.join(root, id);
    if (!existsSync(dir)) continue;
    for (const name of await readdir(dir)) {
      if (!/\.(png|jpe?g)$/i.test(name)) continue;
      const file = path.join(dir, name),
        st = await lstat(file);
      if (st.isSymbolicLink() || !st.isFile())
        throw Error("Image symlink ditolak");
      if (!st.size) empty++;
      else if (st.mtimeMs < opts.startedAt) stale++;
      else found.push(file);
    }
  }
  return { found, stale, empty };
}
export function agyFinalText(raw: string) {
  return String(agyResult(raw).response ?? "");
}
