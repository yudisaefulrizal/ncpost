import React, { useEffect, useState } from "react";
import { api } from "./api";
import type { NewsLab } from "../server/news-lab";
import {
  DEFAULT_WEB_RESEARCH,
  RESEARCH_RECENCY,
  normalizeDomain,
  type ArticleConfig,
  type WebResearch,
} from "../server/content-contract";
export const defaultArticleConfig = (engine: string): ArticleConfig => ({
  source: engine === "news" ? "lab" : "knowledge",
  topicMode: engine === "book" ? "manual" : "ai",
  context: "",
  topic: "",
  material: "",
  paragraphCount: engine === "quote" ? 1 : engine === "book" ? 6 : null,
});
export function ArticleConfigFields({
  value,
  onChange,
  book = false,
  quote = false,
  news = false,
}: {
  value: ArticleConfig;
  onChange: (value: ArticleConfig) => void;
  book?: boolean;
  quote?: boolean;
  /** Artikel mandiri boleh mengambil berita pilihan Jurnalis di Lab Berita. */
  news?: boolean;
}) {
  const set = (patch: Partial<ArticleConfig>) =>
    onChange({ ...value, ...patch });
  const [labs, setLabs] = useState<NewsLab[] | null>(null);
  useEffect(() => {
    if (!news) return;
    api("/news-labs", "GET", undefined, null)
      .then((r: { labs: NewsLab[] }) => setLabs(r.labs))
      .catch(() => setLabs([]));
  }, [news]);
  return (
    <div className="settings-grid article-config-grid">
      <label className="field">
        Sumber bahan
        <select
          value={value.source}
          onChange={(e) =>
            set({ source: e.target.value as ArticleConfig["source"] })
          }
        >
          <option value="knowledge">Pengetahuan AI</option>
          <option value="manual">Bahan manual</option>
          <option value="web">Riset web</option>
          {(news || value.source === "lab") && (
            <option value="lab">Lab Berita</option>
          )}
        </select>
      </label>
      {value.source === "lab" && (
        <label className="field">
          Lab Berita
          <select
            value={value.labId ?? ""}
            onChange={(e) =>
              set({
                labId: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          >
            <option value="">Pilih lab…</option>
            {labs
              ?.filter((lab) => lab.enabled || lab.id === value.labId)
              .map((lab) => (
                <option key={lab.id} value={lab.id}>
                  {lab.theme}
                  {lab.enabled ? "" : " (nonaktif)"}
                </option>
              ))}
          </select>
          {labs && !labs.length && (
            <small className="muted">
              Belum ada lab; buat dulu di menu Lab Berita.
            </small>
          )}
        </label>
      )}
      <label className="field">
        Asal topik
        <select
          value={value.topicMode}
          onChange={(e) =>
            set({ topicMode: e.target.value as ArticleConfig["topicMode"] })
          }
        >
          <option value="manual">Manual</option>
          <option value="ai">Ditentukan AI</option>
        </select>
      </label>
      <label className="field">
        Konteks
        <input
          value={value.context}
          onChange={(e) => set({ context: e.target.value })}
        />
      </label>
      {value.topicMode === "manual" && (
        <label className="field article-topic">
          Topik
          <input
            value={value.topic}
            onChange={(e) => set({ topic: e.target.value })}
          />
        </label>
      )}
      {!quote && (
        <label className="field article-paragraphs">
          Jumlah paragraf
          <input
            type="number"
            min={1}
            max={100}
            value={value.paragraphCount ?? ""}
            placeholder="Mengikuti prompt"
            onChange={(e) =>
              set({
                paragraphCount: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </label>
      )}
      {value.source === "manual" && (
        <label className="field article-material">
          Bahan manual
          <textarea
            rows={6}
            value={value.material}
            onChange={(e) => set({ material: e.target.value })}
          />
        </label>
      )}
      {value.source === "web" && (
        <ResearchFields
          value={value.research}
          aiTopic={value.topicMode === "ai"}
          onChange={(research) => set({ research })}
        />
      )}
    </div>
  );
}

/** Daftar situs: diketik bebas (satu per baris atau dipisah koma). */
function DomainList({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string[];
  onChange: (list: string[]) => void;
}) {
  const [text, setText] = useState(value.join("\n"));
  useEffect(() => {
    const parsed = text.split(/[\s,]+/).filter(Boolean);
    if (parsed.join("|") !== value.join("|")) setText(value.join("\n"));
  }, [value.join("|")]);
  const items = text.split(/[\s,]+/).filter(Boolean);
  const invalid = items.filter((x) => !normalizeDomain(x));
  return (
    <label className="field">
      {label}
      <textarea
        rows={3}
        placeholder="contoh: kompas.com"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.split(/[\s,]+/).filter(Boolean));
        }}
      />
      {invalid.length > 0 && (
        <small className="warn">Bukan nama situs: {invalid.join(", ")}</small>
      )}
    </label>
  );
}

/** Ketentuan riset web; tanpa dicentang, riset berjalan bebas seperti sebelumnya. */
function ResearchFields({
  value,
  aiTopic,
  onChange,
}: {
  value?: WebResearch;
  aiTopic: boolean;
  onChange: (value: WebResearch | undefined) => void;
}) {
  const r = value ?? DEFAULT_WEB_RESEARCH;
  const set = (patch: Partial<WebResearch>) => onChange({ ...r, ...patch });
  return (
    <fieldset className="article-research">
      <legend>
        <label className="check-row">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) =>
              onChange(
                e.target.checked ? { ...DEFAULT_WEB_RESEARCH } : undefined,
              )
            }
          />
          Atur ketentuan riset web
        </label>
      </legend>
      {!value ? (
        <p className="muted">
          Riset web berjalan bebas. Centang untuk mengatur rentang waktu,
          wilayah, situs sumber, dan kewajiban mencantumkan sumber.
        </p>
      ) : (
        <div className="article-research-grid">
          <label className="field">
            Rentang waktu sumber
            <select
              value={r.recency}
              onChange={(e) =>
                set({ recency: e.target.value as WebResearch["recency"] })
              }
            >
              {Object.entries(RESEARCH_RECENCY).map(([key, label]) => (
                <option key={key} value={key}>
                  {key === "any" ? "Bebas" : label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Wilayah sumber
            <input
              placeholder="contoh: Indonesia"
              value={r.region}
              maxLength={100}
              onChange={(e) => set({ region: e.target.value })}
            />
          </label>
          <label className="field">
            Bahasa sumber
            <input
              placeholder="contoh: Indonesia"
              value={r.language}
              maxLength={60}
              onChange={(e) => set({ language: e.target.value })}
            />
          </label>
          <label className="field">
            Minimal sumber per fakta
            <input
              type="number"
              min={1}
              max={10}
              value={r.minSources}
              onChange={(e) =>
                set({
                  minSources: Math.max(
                    1,
                    Math.min(10, Math.round(Number(e.target.value) || 1)),
                  ),
                })
              }
            />
          </label>
          <DomainList
            label="Sumber prioritas"
            value={r.preferred}
            onChange={(preferred) => set({ preferred })}
          />
          <DomainList
            label="Sumber dikecualikan"
            value={r.excluded}
            onChange={(excluded) => set({ excluded })}
          />
          <label className="check-row">
            <input
              type="checkbox"
              checked={r.citeSources}
              onChange={(e) => set({ citeSources: e.target.checked })}
            />
            Wajib cantumkan sumber (URL) di artikel
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={r.avoidRepeat}
              onChange={(e) => set({ avoidRepeat: e.target.checked })}
            />
            Hindari topik yang sudah pernah dibuat
            {!aiTopic && (
              <small className="muted">
                {" "}
                · berlaku bila asal topik Ditentukan AI
              </small>
            )}
          </label>
        </div>
      )}
    </fieldset>
  );
}
