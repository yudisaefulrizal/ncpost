import { quoteInstruction, quoteText } from "../server/quote-text";
import { productionLabPrompt } from "../server/lab-production";
import type { BookSettings } from "../server/book-settings";
import type mysql from "mysql2/promise";
export async function generateStandaloneQuote(
  db: Pick<mysql.Pool, "query">,
  settings: BookSettings,
  theme: string,
  work: string,
  generate: (prompt: string, work: string) => Promise<string>,
) {
  const lab = await productionLabPrompt(db, settings, "QUOTE", {
    teks: theme,
    artikel: theme,
    quote: theme,
    bab: theme,
    buku: "",
  });
  return quoteText(
    await generate(
      quoteInstruction(
        lab?.prompt || `Buat quote berdasarkan tema berikut: ${theme}`,
      ),
      work,
    ),
  );
}
