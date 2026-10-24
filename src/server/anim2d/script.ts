// Naskah Video Animasi 2D: Codex mengubah artikel menjadi adegan (template +
// item di slot), lalu naskah disanitasi dan dirapikan agar aman digambar.
// Naskah dari model tidak dipercaya: semua field dibatasi dan divalidasi.
import { fillPrompt } from "../prompts";
import {
  ANIMS,
  COLORS,
  COMPS,
  ITEM_KINDS,
  LOOPS,
  MOODS,
  NUS_POSES,
  PROP_INFO,
  PROP_NAMES,
  WORLDS,
  compCatalogText,
  propCatalogText,
} from "./catalog";
import { resolveIcon } from "./icons";
import { norm, type Obj } from "./state";

export interface ScriptScene {
  layout: "stage" | "outro";
  mood: string;
  /** Teks yang dibacakan adegan ini. */
  narration: string;
  /** Bagian narasi (audio) milik adegan: [from, from+count). */
  from?: number;
  count?: number;
  title: string;
  hl: string[];
  comp?: string;
  items?: Obj[];
  links?: Obj[];
  focusSlot?: string;
  nus?: { pose?: string; side?: "l" | "r" };
  icon?: string;
  cta?: string;
}
export interface Script {
  title: string;
  description: string;
  hashtags: string[];
  world: string;
  scenes: ScriptScene[];
}

const str = (x: unknown, max = 80) =>
  String(x ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
const num = (x: unknown) => {
  const n = Number(String(x).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const color = (c: unknown) => {
  const v = String(c || "").trim();
  return COLORS.includes(v) || /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : undefined;
};
// Potong di batas kata agar teks muat di tempatnya.
const fit = (t: string, max: number) => {
  if (t.length <= max) return t;
  return t.slice(0, max + 1).replace(/\s+\S*$/, "") || t.slice(0, max);
};
const LIMITS: Record<string, number> = {
  text: 24,
  note: 44,
  bubble: 40,
  badge: 16,
};
const words = (s: string) =>
  String(s || "")
    .split(/\s+/)
    .filter(Boolean);

function sanitizeItems(list: unknown): Obj[] {
  return (Array.isArray(list) ? list : []).flatMap((it: any) => {
    if (!it || !ITEM_KINDS.includes(it.t)) return [];
    const one = (x: unknown) => str(x, 40).toLowerCase().split(" ")[0] || "";
    const r: Obj = {
      slot: str(it.slot, 16),
      t: it.t,
      cue: one(it.cue),
      a: ANIMS.includes(it.a) ? it.a : "pop",
      loop: LOOPS.includes(it.loop) ? it.loop : "none",
    };
    const id = String(it.id || "")
      .replace(/[^\w-]/g, "")
      .slice(0, 20);
    if (id) r.id = id;
    if (it.out) r.out = one(it.out);
    if (it.to && typeof it.to === "object")
      r.to = { slot: str(it.to.slot, 16), cue: one(it.to.cue) };
    if (it.count)
      r.count = Math.min(3, Math.max(1, Math.round(num(it.count)) || 1));
    for (const k of ["c", "c2", "c3"]) if (color(it[k])) r[k] = color(it[k]);
    if (it.t === "prop") {
      if (!PROP_NAMES.includes(it.n)) return [];
      r.n = it.n;
      if (it.v !== undefined) r.v = str(it.v, 14);
      if (it.v2 !== undefined) r.v2 = str(it.v2, 10);
    }
    if (it.t === "icon") {
      const n = resolveIcon(it.n);
      if (!n) return [];
      r.n = n;
      r.bg = it.bg !== false;
    }
    if (it.t === "counter")
      Object.assign(r, {
        v: num(it.v),
        prefix: str(it.prefix, 6),
        suffix: str(it.suffix, 14),
      });
    if (it.t === "bars")
      r.vals = (Array.isArray(it.vals) ? it.vals : [])
        .slice(0, 6)
        .map((v: unknown) => Math.max(0, num(v)));
    if (it.t === "note")
      Object.assign(r, { v: str(it.v, 120), small: str(it.small, 44) });
    if (it.t === "text") r.v = str(it.v, 80);
    if (it.t === "badge")
      Object.assign(r, {
        v: str(it.v, 60),
        head: str(it.head, 22).toUpperCase(),
      });
    if (it.t === "bubble")
      Object.assign(r, {
        v: str(it.v, 120),
        tail: it.tail === "r" ? "r" : "l",
      });
    if (LIMITS[it.t]) r.v = fit(r.v, LIMITS[it.t]);
    return [r];
  });
}

// Rapikan adegan agar bisa digambar: item ke slot yang menerima jenisnya,
// benda tanah ke slot tanah, cue/out/to hanya kata yang diucapkan, panah dan
// fokus hanya ke slot terisi, id yang sama hanya untuk benda yang sama.
function arrange(sc: ScriptScene) {
  const slots = COMPS[sc.comp!].slots;
  const spoken = words(sc.narration).map(norm);
  const said = (w: string) => {
    const k = norm(words(w)[0] || "");
    return (
      !!k &&
      (spoken.includes(k) ||
        spoken.some((x) => x.startsWith(k) && k.length >= 4))
    );
  };
  const placeOf = (it: Obj) => (it.t === "prop" ? PROP_INFO[it.n]?.[1] : "any");
  const used = new Set<string>();
  const kept: Obj[] = [];
  for (const it of sc.items || []) {
    const fits = (name: string) =>
      !!slots[name] &&
      slots[name].kinds.includes(it.t) &&
      !used.has(name) &&
      !(placeOf(it) === "sky" && slots[name].ground);
    const slot = fits(it.slot) ? it.slot : Object.keys(slots).find(fits);
    if (!slot) continue;
    it.slot = slot;
    used.add(slot);
    kept.push(it);
  }
  for (const it of kept)
    if (placeOf(it) === "ground" && !slots[it.slot].ground) {
      const g = Object.keys(slots).find((n) => slots[n].ground && !used.has(n));
      if (g) {
        used.delete(it.slot);
        used.add(g);
        it.slot = g;
      }
    }
  for (const it of kept) {
    if (it.cue && !said(it.cue)) it.cue = "";
    if (it.out && !said(it.out)) delete it.out;
    if (it.to && (!slots[it.to.slot] || !said(it.to.cue))) delete it.to;
  }
  sc.items = kept;
  const filled = new Set(kept.map((it) => it.slot));
  sc.links = (sc.links || []).filter(
    (l) => filled.has(l.from) && filled.has(l.to) && l.from !== l.to,
  );
  if (sc.focusSlot && !filled.has(sc.focusSlot)) delete sc.focusSlot;
}

// Berapa bagian narasi tiap adegan: seluruh bagian terpakai tepat sekali dan
// berurutan; adegan tanpa bagian tersisa dibuang, sisanya masuk adegan akhir.
function partCounts(scenes: any[], total: number) {
  let left = total;
  const taken: { scene: any; count: number }[] = [];
  for (const scene of scenes) {
    const want = Math.max(1, Math.round(num(scene.bagian)) || 1);
    const count = Math.min(want, left);
    if (count < 1) break;
    taken.push({ scene, count });
    left -= count;
  }
  if (left > 0 && taken.length) taken.at(-1)!.count += left;
  return taken;
}

/**
 * texts = teks tiap bagian narasi (audio): adegan mengelompokkan bagian
 * berurutan dan dibacakan apa adanya. Tanpa texts, narasi dibaca dari naskah
 * (pratinjau).
 */
export function sanitizeScript(
  raw: any,
  fallbackTitle: string,
  texts?: string[],
): Script {
  const list = (Array.isArray(raw?.scenes) ? raw.scenes : []).filter(
    (s: any) => s && (texts || str(s.narration)),
  );
  if (!list.length) throw Error("Naskah video 2D tidak berisi adegan");
  let cursor = 0;
  const arr: { scene: any; from: number; count: number; narration: string }[] =
    texts
      ? partCounts(list, texts.length).map(({ scene, count }) => {
          const from = cursor;
          cursor += count;
          return {
            scene,
            from,
            count,
            narration: texts.slice(from, from + count).join(" "),
          };
        })
      : list.map((scene: any) => ({
          scene,
          from: 0,
          count: 1,
          narration: str(scene.narration, 2000),
        }));
  if (!arr.length) throw Error("Naskah video 2D tidak berisi adegan");
  const scenes: ScriptScene[] = arr.map(
    ({ scene: s, from, count, narration }, i): ScriptScene => {
      const last = i === arr.length - 1 && arr.length > 1;
      const o: ScriptScene = {
        layout: last ? "outro" : "stage",
        mood: MOODS.includes(s.mood) ? s.mood : "happy",
        narration,
        ...(texts ? { from, count } : {}),
        title: str(s.title, 60),
        hl: (Array.isArray(s.hl) ? s.hl : [])
          .slice(0, 3)
          .map((h: unknown) => str(h, 24))
          .filter((h: string) => h && norm(narration).includes(norm(h))),
      };
      if (last) {
        o.icon = resolveIcon(s.icon) || "message-circle";
        o.cta = fit(str(s.cta || "Komen pendapatmu!", 120), 48);
        o.title ||= "Menurutmu *gimana*?";
        return o;
      }
      o.comp = COMPS[s.comp] ? s.comp : "hero";
      o.items = sanitizeItems(s.items);
      o.links = (Array.isArray(s.links) ? s.links : [])
        .slice(0, 3)
        .map((l: any) => ({
          from: str(l?.from, 16),
          to: str(l?.to, 16),
          cue: str(l?.cue, 24).toLowerCase(),
          dash: !!l?.dash,
        }));
      if (typeof s.focus === "string" && s.focus)
        o.focusSlot = str(s.focus, 16);
      if (s.nus && (s.nus.side === "l" || s.nus.side === "r"))
        (o.nus ||= {}).side = s.nus.side;
      if (s.nus && NUS_POSES.includes(s.nus.pose))
        (o.nus ||= {}).pose = s.nus.pose;
      arrange(o);
      return o;
    },
  );
  // id yang sama di adegan berikutnya harus benda yang sama.
  for (let i = 1; i < scenes.length; i++) {
    const prev = new Map(
      (scenes[i - 1].items || []).filter((x) => x.id).map((x) => [x.id, x]),
    );
    for (const it of scenes[i].items || []) {
      const p = it.id && prev.get(it.id);
      if (p && (p.t !== it.t || p.n !== it.n)) it.id = `${it.id}_${i}`;
    }
  }
  return {
    title: str(raw.title || fallbackTitle, 100),
    description: str(raw.description, 300),
    hashtags: (Array.isArray(raw.hashtags) ? raw.hashtags : [])
      .slice(0, 8)
      .map((h: unknown) => str(h, 30)),
    world: WORLDS.includes(raw.world) ? raw.world : "city",
    scenes,
  };
}

export const scriptPrompt = (title: string, texts: string[]) =>
  fillPrompt("video-2d/naskah.md", {
    judul: title,
    bagian: texts.map((t, i) => `${i + 1}. ${t}`).join("\n"),
    template: compCatalogText(),
    prop: propCatalogText(),
  });

function extractJson(text: string) {
  const a = text.indexOf("{"),
    b = text.lastIndexOf("}");
  if (a < 0 || b < a) throw Error("Respons naskah tidak berisi JSON");
  return JSON.parse(text.slice(a, b + 1));
}

/** Susun adegan dari bagian narasi; diulang bila keluaran model tidak terbaca. */
export async function writeScript(
  title: string,
  texts: string[],
  ask: (prompt: string) => Promise<string>,
) {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return sanitizeScript(
        extractJson(await ask(scriptPrompt(title, texts))),
        title,
        texts,
      );
    } catch (error) {
      last = error;
    }
  }
  throw last;
}
