import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { initConfig, ROOT } from "../src/server/config";
import { codex, runCli } from "../src/server/providers";
import { generateCodexImage } from "../src/server/codex-image";
initConfig();
const directory = path.join(ROOT, "output/probes");
await mkdir(directory, { recursive: true, mode: 0o700 });
const version = (
  await runCli(
    process.env.CODEX_EXECUTABLE || "codex",
    ["--version"],
    "",
    ROOT,
    10000,
  )
).trim();
const text = await codex(
  "Jangan memakai tool atau membaca file. Jawab hanya NCPOST_TEXT_OK.",
  directory,
);
if (text.trim() !== "NCPOST_TEXT_OK")
  throw Error("Probe text tidak menghasilkan marker yang diminta");
console.log("TEXT LIVE PASS", version);
if (process.argv.includes("--image")) {
  const output = path.join(directory, "cli-image.png");
  const result = await generateCodexImage(
    "Editorial photorealistic stock photo of a closed notebook beside a small potted green plant on a wooden desk, soft natural daylight, no people.",
    directory,
    output,
    "horizontal",
  );
  const data = await readFile(output);
  const evidence = {
    executable: "codex",
    version,
    text: "passed",
    image: "passed",
    ...result,
    bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
    probedAt: new Date().toISOString(),
    mode: "real-cli-probe-not-final-production",
  };
  await writeFile(
    path.join(directory, "provider-evidence.json"),
    JSON.stringify(evidence, null, 2),
    { mode: 0o600 },
  );
  console.log("IMAGE LIVE PASS", JSON.stringify(evidence));
}
