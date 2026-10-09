import { labImageFile, labAttachments } from "../server/lab-images";
import { newsCliArgs, parseNewsResearch } from "./news";
import { runCli } from "../server/providers";
import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { LabStore, labFinalPrompt, type LabRun } from "../server/lab";
import { outputRoot } from "../server/output-paths";
import { codex } from "../server/providers";
import { generateCodexImage } from "../server/codex-image";
export async function runLabJob(
  store: LabStore,
  job: LabRun,
  providers = { codex, generateCodexImage },
) {
  const work = path.join(outputRoot(), "lab", String(job.id));
  const heartbeat = setInterval(() => {
    void store.heartbeat(job.id).catch(() => {});
  }, 60000);
  try {
    mkdirSync(work, { recursive: true, mode: 0o700 });
    const prompt = job.resolved_prompt || labFinalPrompt(job.prompt, job.input);
    writeFileSync(path.join(work, "prompt.txt"), prompt, { mode: 0o600 });
    if (job.kind === "article") {
      const text =
        job.reference_key === "news"
          ? parseNewsResearch(
              await runCli(
                process.env.CODEX_EXECUTABLE || "codex",
                newsCliArgs(),
                prompt,
                work,
                900000,
              ),
            ).result.article
          : await providers.codex(prompt, work);
      if (!text.trim()) throw Error("Provider tidak menghasilkan artikel");
      writeFileSync(path.join(work, "article.md"), text, { mode: 0o600 });
      await store.complete(job.id, { text });
    } else {
      const meta = await providers.generateCodexImage(
        prompt,
        work,
        path.join(work, "image.jpg"),
        job.orientation,
        await Promise.all(labAttachments(job).map(labImageFile)),
      );
      await store.complete(job.id, {
        image: true,
        width: meta.width,
        height: meta.height,
      });
    }
  } catch (error) {
    await store.fail(
      job.id,
      error instanceof Error ? error.message : "Uji Lab gagal",
    );
  } finally {
    clearInterval(heartbeat);
  }
}
