import { labConfig } from "../server/lab-config";
import { runConfiguredModel } from "./configured-article";
import { validateUnifiedArticle } from "../server/content-contract";
import { quoteText, quoteInstruction } from "../server/quote-text";
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
  providers: {
    codex: typeof codex;
    generateCodexImage: typeof generateCodexImage;
    configuredArticle?: typeof runConfiguredModel;
  } = { codex, generateCodexImage, configuredArticle: runConfiguredModel },
) {
  const work = path.join(outputRoot(), "lab", String(job.id));
  const heartbeat = setInterval(() => {
    void store.heartbeat(job.id).catch(() => {});
  }, 60000);
  try {
    mkdirSync(work, { recursive: true, mode: 0o700 });
    const config = labConfig(job.config);
    const basePrompt =
      job.resolved_prompt || labFinalPrompt(job.prompt, job.input);
    const posting = job.kind === "image" && job.image_type === "ready_post";
    const readyVideo = job.kind === "image" && job.image_type === "ready_video";
    const prompt =
      !config && readyVideo
        ? `${basePrompt}\n\nBuat gambar final siap jadi video, termasuk teks dan desain sesuai instruksi. Rasio ${job.orientation === "horizontal" ? "16:9, 1920 × 1080" : "9:16, 1080 × 1920"}; aturan ini menggantikan orientasi ilustrasi pada acuan. Sisakan margin aman dan jangan potong teks atau logo.`
        : !config && posting
          ? `${basePrompt}\n\nBuat gambar final siap posting dengan teks dan desain sesuai instruksi. Ukuran 1080 × 1350, rasio 4:5. Instruksi rasio ini menggantikan orientasi ilustrasi pada acuan. Sisakan margin aman; jangan memotong teks, referensi, atau logo.`
          : job.kind === "quote"
            ? quoteInstruction(basePrompt)
            : basePrompt;
    writeFileSync(path.join(work, "prompt.txt"), prompt, { mode: 0o600 });
    if (job.kind !== "image") {
      const text = config?.article
        ? await (providers.configuredArticle || runConfiguredModel)(
            prompt,
            config.article.source,
            work,
          )
        : job.reference_key === "news"
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
      if (config?.article) {
        const parsed = validateUnifiedArticle(
          text,
          config.article.paragraphCount,
          job.reference_key === "quote",
        );
        if (!parsed.ok) throw Error(parsed.errors.join("; "));
      }
      if (job.kind === "quote" || job.reference_key === "quote")
        quoteText(text);
      if (!text.trim()) throw Error("Provider tidak menghasilkan artikel");
      writeFileSync(path.join(work, "article.md"), text, { mode: 0o600 });
      await store.complete(job.id, { text });
    } else {
      const meta = await providers.generateCodexImage(
        prompt,
        work,
        path.join(work, "image.jpg"),
        config
          ? "bebas"
          : readyVideo
            ? job.orientation === "horizontal"
              ? "video-h"
              : "video-v"
            : !config && posting
              ? "posting"
              : job.orientation,
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
