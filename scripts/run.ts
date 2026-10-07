// Satu perintah untuk server + worker (npm run dev / npm start). Keduanya tetap
// proses terpisah; bila salah satu berhenti, yang lain ikut dihentikan.
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
const watch = process.argv.includes("--watch");
const tsx = path.join(process.cwd(), "node_modules/.bin/tsx");
const children: ChildProcess[] = [];
let stopping = false;
function stop(code: number) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill("SIGTERM");
  process.exitCode = code;
}
for (const entry of ["src/server/http.ts", "src/worker/main.ts"]) {
  const child = spawn(tsx, watch ? ["watch", entry] : [entry], {
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code) => stop(code ?? 1));
  children.push(child);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
