import React from "react";
import type { ArticleConfig } from "../server/content-contract";
export const defaultArticleConfig = (engine: string): ArticleConfig => ({
  source: engine === "news" ? "web" : "knowledge",
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
}: {
  value: ArticleConfig;
  onChange: (value: ArticleConfig) => void;
  book?: boolean;
  quote?: boolean;
}) {
  const set = (patch: Partial<ArticleConfig>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="settings-grid">
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
        </select>
      </label>
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
        <label className="field">
          Topik
          <input
            value={value.topic}
            onChange={(e) => set({ topic: e.target.value })}
          />
        </label>
      )}
      {!quote && (
        <label className="field">
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
        <label className="field">
          Bahan manual
          <textarea
            rows={6}
            value={value.material}
            onChange={(e) => set({ material: e.target.value })}
          />
        </label>
      )}
    </div>
  );
}
