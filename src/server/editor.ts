import { readFileSync } from "node:fs";
import path from "node:path";
import { validateArticle, validateDraft } from "./domain";
const root = path.resolve(process.cwd(), "prompts/editor");
// draft=true: draf Codex sebelum hook (heading identik judul, lima paragraf).
export function editorLint(article: string, draft = false) {
  const lex = JSON.parse(
    readFileSync(path.join(root, "lexicon-hindari.json"), "utf8"),
  );
  const foreign = JSON.parse(
    readFileSync(path.join(root, "istilah-asing-dipertahankan.json"), "utf8"),
  );
  const findings: {
    term: string;
    replacement: string;
    severity: string;
    reason: string;
  }[] = [];
  for (const x of lex.entries)
    if (new RegExp(x.pattern, "iu").test(article))
      findings.push({
        term: x.term,
        replacement: x.ganti,
        severity: x.severity,
        reason: x.alasan,
      });
  for (const x of foreign.entries)
    for (const term of x.varian_terjemahan_dihindari)
      if (article.toLowerCase().includes(term.toLowerCase()))
        findings.push({
          term,
          replacement: x.istilah_asli,
          severity: x.severity,
          reason: x.alasan,
        });
  const structure = draft ? validateDraft(article) : validateArticle(article);
  return {
    ok: structure.ok && !findings.some((x) => x.severity === "error"),
    structure,
    findings,
    lexiconVersion: lex.version,
    foreignVersion: foreign.version,
  };
}
