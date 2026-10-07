import { it, expect } from "vitest";
import { editorLint } from "../src/server/editor";
it("lexicon dan istilah asing sumber masuk laporan, tidak diganti mekanis", () => {
  const v = editorLint("kulakan dan kerja mendalam");
  expect(v.findings.some((x) => x.term === "kulakan")).toBe(true);
  expect(v.findings.some((x) => x.replacement === "Deep Work")).toBe(true);
});
