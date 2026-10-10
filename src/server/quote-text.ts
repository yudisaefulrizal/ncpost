export function quoteText(raw: string) {
  const text = raw.trim();
  if (!text || /\n\s*\n|(^|\n)\s*(?:#|[-*] |\d+\. |Sumber:|Tag:)/.test(text))
    throw Error(
      "Quote wajib satu paragraf tanpa judul, heading, sumber, tag, atau daftar",
    );
  return text.replace(/\s*\n\s*/g, " ");
}
export function quoteInstruction(prompt: string) {
  return `${prompt}\n\nFormat hasil: hanya satu paragraf quote. Tanpa judul, heading, sumber, tag, daftar, atau penjelasan tambahan.`;
}
