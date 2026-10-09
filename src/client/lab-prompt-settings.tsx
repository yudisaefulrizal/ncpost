import React, { useEffect, useState } from "react";
type Prompt = {
  id: number;
  name: string;
  kind: "article" | "image";
  reference_key: string | null;
};
export function LabPromptSettings({
  engine,
  selected,
  images,
  onChange,
}: {
  engine: "book" | "news";
  selected: number[];
  images: boolean;
  onChange: (ids: number[]) => void;
}) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    Promise.all(
      ["article", "image"].map(async (kind) => {
        const response = await fetch(`/api/lab/prompts?kind=${kind}`);
        const data = await response.json();
        if (!response.ok) throw Error(data.error || "Gagal memuat prompt Lab");
        return data as Prompt[];
      }),
    )
      .then((parts) => {
        if (current) {
          setPrompts(parts.flat());
          setError("");
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [engine]);
  return (
    <div className="settings-grid">
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      {(["article", "image"] as const)
        .filter((kind) => kind !== "image" || images)
        .map((kind) => {
          const list = prompts.filter(
            (p) =>
              p.kind === kind &&
              (kind !== "article" ||
                !p.reference_key ||
                p.reference_key === engine),
          );
          return (
            <div className="stack-sm" key={kind}>
              <b>Prompt {kind === "article" ? "Artikel" : "Gambar"}</b>
              {list.map((prompt) => (
                <label className="check-row" key={prompt.id}>
                  <input
                    type="checkbox"
                    className="lab-prompt-switch"
                    role="switch"
                    aria-label={prompt.name}
                    checked={selected.includes(prompt.id)}
                    onChange={() =>
                      onChange(
                        selected.includes(prompt.id)
                          ? selected.filter((id) => id !== prompt.id)
                          : [...selected, prompt.id],
                      )
                    }
                  />
                  <span>{prompt.name}</span>
                  <small className="muted">
                    {selected.includes(prompt.id) ? "Aktif" : "Nonaktif"}
                  </small>
                </label>
              ))}
            </div>
          );
        })}
    </div>
  );
}
