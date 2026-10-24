// Timeline Video Animasi 2D: waktu tiap kata narasi, frasa caption, dan
// durasi adegan (port tts.mjs Nus 2D Studio).
import type { Script } from "./script";
import { norm, type Chunk, type Scene, type Word } from "./state";

export const LEAD = 0.08; // jeda sebelum narasi tiap adegan
export const TAIL = 0.22; // jeda setelah narasi selesai

export interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}
/** Timing per huruf (ElevenLabs) -> timing per kata. */
export function charsToWords(text: string, al: Alignment): Word[] {
  const out: Word[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const i0 = m.index,
      i1 = m.index + m[0].length - 1;
    const s = al.character_start_times_seconds[i0],
      e =
        al.character_end_times_seconds[
          Math.min(i1, al.character_end_times_seconds.length - 1)
        ];
    if (s === undefined || e === undefined) continue;
    const core = m[0].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!core) continue;
    out.push({ w: core, p: (/[.,;:!?…]+$/.exec(m[0]) || [""])[0], s, e });
  }
  return out;
}
/** Tanpa timing dari layanan suara: dibagi menurut panjang kata. */
export function spreadWords(text: string, seconds: number): Word[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const weight = tokens.map((t) => t.length + 1),
    total = weight.reduce((a, b) => a + b, 0) || 1;
  let at = 0;
  return tokens.map((t, i) => {
    const s = (at / total) * seconds;
    at += weight[i];
    return {
      w: t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "") || t,
      p: (/[.,;:!?…]+$/.exec(t) || [""])[0],
      s,
      e: (at / total) * seconds,
    };
  });
}

// Tanda baca akhir tiap kata diambil dari teks narasi.
function alignPunct(words: Word[], narration: string) {
  const toks = narration.split(/\s+/);
  let ti = 0;
  for (const w of words) {
    const k = norm(w.w);
    for (let j = ti; j < Math.min(toks.length, ti + 4); j++)
      if (k && norm(toks[j]).startsWith(k)) {
        w.p = (/[.,;:!?…]+$/.exec(toks[j]) || [""])[0];
        ti = j + 1;
        break;
      }
  }
}

// Frasa caption: per kalimat, dibagi rata (maks 6 kata / 34 huruf per frasa)
// agar tidak ada sisa satu kata.
export function chunkWords(words: Word[]): Chunk[] {
  const sentences: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    cur.push(w);
    if (/[.!?…]/.test(w.p || "")) {
      sentences.push(cur);
      cur = [];
    }
  }
  if (cur.length) sentences.push(cur);
  const chunks: Chunk[] = [];
  for (const sent of sentences) {
    const n = sent.length,
      chars = sent.reduce((a, x) => a + x.w.length + 1, 0);
    const pieces = Math.max(Math.ceil(n / 6), Math.ceil(chars / 34), 1);
    const cuts: number[] = [];
    for (let k = 1; k < pieces; k++) {
      let c = Math.round((n * k) / pieces);
      // geser ke koma terdekat (maks 1 kata) agar pemenggalan wajar
      for (const d of [0, -1, 1])
        if (
          sent[c + d - 1] &&
          /[,;:]/.test(sent[c + d - 1].p || "") &&
          c + d > 0 &&
          c + d < n
        ) {
          c += d;
          break;
        }
      cuts.push(c);
    }
    let from = 0;
    for (const c of [...cuts, n]) {
      if (c > from) chunks.push({ words: sent.slice(from, c), s: 0, e: 0 });
      from = c;
    }
  }
  chunks.forEach((c, i) => {
    c.s = c.words[0].s;
    c.e =
      i + 1 < chunks.length ? chunks[i + 1].words[0].s : c.words.at(-1)!.e + 0.4;
  });
  return chunks;
}

/** Adegan berwaktu dari narasi tiap adegan (kata + durasi audionya). */
export function sceneTimeline(
  script: Script,
  narration: { words: Word[]; seconds: number }[],
) {
  const scenes: Scene[] = [];
  let t = 0;
  script.scenes.forEach((sc, i) => {
    const { seconds } = narration[i];
    const dur = LEAD + seconds + TAIL;
    const timed = (
      narration[i].words.length
        ? narration[i].words
        : spreadWords(sc.narration, seconds)
    ).map((x) => ({ ...x, s: x.s + LEAD, e: x.e + LEAD }));
    alignPunct(timed, sc.narration);
    scenes.push({
      ...sc,
      objects: [],
      start: t,
      end: t + dur,
      dur,
      words: timed,
      chunks: chunkWords(timed),
    });
    t += dur;
  });
  return { scenes, total: t };
}

/** Timing sintetis (pratinjau tanpa suara). */
export function evenTimeline(script: Script) {
  return sceneTimeline(
    script,
    script.scenes.map((sc) => {
      const n = sc.narration.split(/\s+/).length;
      return { words: [], seconds: 0.3 + n * 0.38 };
    }),
  );
}
