// Port build_tts_narration (tts_text_prep.py Hermes) untuk eleven_v3
// (ELEVENLABS_TTS_CONTRACT.md Bagian B): hanya teks narasi yang diubah,
// artikel sumber tidak disentuh.
function stripMarkdownEmphasis(value: string) {
  return value
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`(.+?)`/g, "$1");
}
// eleven_v3: bracket adalah audio tag sah sehingga dipertahankan; pasangan
// /…/ (notasi IPA) dan '#' dibuang.
export function sanitizeForTts(text: string) {
  return stripMarkdownEmphasis(text)
    .replace(/\/([^/\n]{1,40})\//g, "$1")
    .replace(/#/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
// Panel 1 membacakan heading lalu paragraf dengan jeda [pause]; panel 2–5
// hanya paragraf.
export function ttsNarration(
  heading: string,
  paragraph: string,
  isFirstPanel: boolean,
) {
  const body = sanitizeForTts(paragraph);
  return isFirstPanel ? `${sanitizeForTts(heading)}. [pause] ${body}` : body;
}
