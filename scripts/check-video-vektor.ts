import { createServer } from "node:net";
import { readFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import {
  runPipeline,
  vectorRoot,
  probeVector,
} from "../src/server/video-vektor";

const root = vectorRoot();
const cache = path.join(root, ".cache/video-pipeline/validation");
mkdirSync(cache, { recursive: true });
const dir = mkdtempSync(path.join(cache, "check-"));
try {
  // Validation can run alongside the standalone project's renderer on 8078.
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const chosen = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(chosen)));
    });
  });
  // Same cgroup, GL backend, config, and invocation as a native worker job.
  const output = path.join(dir, "check.mp4");
  await runPipeline(
    {
      id: "check",
      cache: dir,
      output: dir,
      args: [
        path.join(root, "node_modules/@remotion/cli/remotion-cli.js"),
        "render",
        "styles/vektor-kucing/contoh/index.ts",
        "CeritaKucingVisual",
        output,
        `--port=${port}`,
        "--frames=90-91",
        "--muted",
        "--gl=swangle",
        "--concurrency=1",
        "--log=error",
      ],
    },
    root,
  );
  console.log(readFileSync(path.join(dir, "resources.log"), "utf8").trim());
  const spec = await probeVector(output);
  if (spec.frames !== 2) throw Error("Jumlah frame pemeriksaan tidak sesuai.");
  console.log(
    "Render Video Vektor CPU berhasil: 1920×1080, 2 frame, cgroup RAM maksimal 2 GB.",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
