import {
  quoteInstruction,
  quoteText,
  standaloneQuotePrompt,
} from "../server/quote-text";
import { selectLabPrompt } from "../server/lab-production";
import type { BookSettings } from "../server/book-settings";
import type mysql from "mysql2/promise";
export async function generateStandaloneQuote(
  db: Pick<mysql.Pool, "query">,
  settings: BookSettings,
  work: string,
  generate: (prompt: string, work: string) => Promise<string>,
) {
  const ids = settings.labPromptIds || [];
  if (!ids.length)
    throw Error("Aktifkan prompt Lab Quote di Pengaturan Konten");
  const [rows]: any = await db.query(
    "SELECT * FROM lab_prompts WHERE id IN (?) ORDER BY id",
    [ids],
  );
  const row = selectLabPrompt(rows, "QUOTE");
  if (!row) throw Error("Aktifkan prompt Lab Quote di Pengaturan Konten");
  return quoteText(
    await generate(quoteInstruction(standaloneQuotePrompt(row.prompt)), work),
  );
}
