import { afterEach, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";
import { labInput } from "../src/server/lab";
import { labReferences, resolveLabPrompt } from "../src/server/lab-references";
import {
  productionLabPrompt,
  selectLabPrompt,
} from "../src/server/lab-production";
import { DEFAULT_BOOK_SETTINGS } from "../src/server/book-settings";
import { quoteText } from "../src/server/quote-text";
import { runLabJob } from "../src/worker/lab";
afterEach(() => {
  rmSync("output/.test/lab/991299", { recursive: true, force: true });
  vi.unstubAllEnvs();
});
it("offers a separate quote reference and selects only quote prompts for quote production", async () => {
  expect(
    labInput({
      kind: "quote",
      name: "Quote",
      prompt: "Ringkas",
      referenceKey: "quote",
    }).kind,
  ).toBe("quote");
  const reference = labReferences("quote")[0];
  expect(reference.id).toBe("quote");
  expect(resolveLabPrompt("quote", "quote", reference.prompt)).not.toContain(
    "{{paragraf}}",
  );
  const rows = [
    { id: 1, kind: "article", prompt: "Artikel", reference_key: "book" },
    {
      id: 2,
      kind: "quote",
      prompt: "Ringkas {{paragraf}}",
      reference_key: "quote",
    },
  ];
  expect(selectLabPrompt(rows, "QUOTE")?.id).toBe(2);
  expect(selectLabPrompt(rows, "book")?.id).toBe(1);
  const query = vi.fn().mockResolvedValue([rows]);
  const lab = await productionLabPrompt(
    { query } as any,
    { ...DEFAULT_BOOK_SETTINGS, labPromptIds: [1, 2] },
    "QUOTE",
    { teks: "Isi artikel." },
  );
  expect(lab?.prompt).toBe("Ringkas Isi artikel.");
});
it("enforces one paragraph without article metadata", () => {
  expect(quoteText("Satu kalimat.\nKalimat lain.")).toBe(
    "Satu kalimat. Kalimat lain.",
  );
  for (const text of [
    "",
    "# Judul\nIsi",
    "Satu.\n\nDua.",
    "Quote.\nSumber: Buku",
    "- Daftar",
  ])
    expect(() => quoteText(text)).toThrow("satu paragraf");
});
it("tests quote as text and rejects article-shaped results without invoking image generation", async () => {
  vi.stubEnv("NCPOST_TEST", "true");
  const store = { heartbeat: vi.fn(), complete: vi.fn(), fail: vi.fn() } as any;
  const providers = {
    codex: vi.fn().mockResolvedValue("Quote satu paragraf."),
    generateCodexImage: vi.fn(),
  };
  const job = {
    id: 991299,
    kind: "quote",
    prompt: "Ringkas",
    input: "Artikel",
    orientation: "bebas",
  } as any;
  await runLabJob(store, job, providers);
  expect(store.complete).toHaveBeenCalledWith(job.id, {
    text: "Quote satu paragraf.",
  });
  expect(providers.generateCodexImage).not.toHaveBeenCalled();
  providers.codex.mockResolvedValue("Satu.\n\nDua.");
  await runLabJob(store, job, providers);
  expect(store.fail).toHaveBeenCalledWith(
    job.id,
    expect.stringContaining("satu paragraf"),
  );
});
