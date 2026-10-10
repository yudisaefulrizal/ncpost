import { ContentPlanFields, finalTargets, planSettings } from "./content-plan";
import type { BookSettings } from "../server/book-settings";
import { Modal } from "./modal";
import React, { useState, createContext, useContext } from "react";
import { FINAL_OUTPUTS, type ContentType } from "../server/content-type-domain";
import { api } from "./api";
export const ContentTypeContext = createContext<ContentType | null>(null);
export const useContentType = () => useContext(ContentTypeContext);
export function ContentTypes({
  items,
  onOpen,
  onSaved,
}: {
  items: ContentType[];
  onOpen: (type: ContentType) => void;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<ContentType | "new" | null>(null);
  const [name, setName] = useState("");
  const [engine, setEngine] = useState<ContentType["engine"]>("book");
  const [outputs, setOutputs] = useState<string[]>(["VIDEO_KALIMAT"]);
  const [settings, setSettings] = useState<BookSettings>(() => ({
    ...planSettings(["VIDEO_KALIMAT"], null),
    autoProcess: false,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const edit = (type: ContentType | "new") => {
    setEditing(type);
    setName(type === "new" ? "" : type.name);
    setEngine(type === "new" ? "book" : type.engine);
    const next =
      type === "new"
        ? ["VIDEO_KALIMAT"]
        : type.engine === "quote"
          ? ["POST_IMAGE"]
          : finalTargets(type.outputs);
    setOutputs(next);
    setSettings(
      type === "new"
        ? { ...planSettings(next, null), autoProcess: false }
        : planSettings(next, type.settings),
    );
    setError("");
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        editing === "new"
          ? "/content-types"
          : `/content-types/${(editing as ContentType).id}`,
        editing === "new" ? "POST" : "PUT",
        { name, engine, outputs, settings },
      );
      await onSaved();
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card queue">
      <div className="card-head">
        <h2>Jenis konten</h2>
        <button className="btn btn-pri btn-sm" onClick={() => edit("new")}>
          Tambah jenis
        </button>
      </div>
      <div className="table">
        <table>
          <thead>
            <tr>
              <th>Nama</th>
              <th>Target output</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {items.map((type) => (
              <tr key={type.id}>
                <td>
                  <button className="title-link" onClick={() => onOpen(type)}>
                    {type.name}
                  </button>
                </td>
                <td>
                  {FINAL_OUTPUTS.filter(([key]) => type.outputs.includes(key))
                    .map(([, label]) => label)
                    .join(", ") || "Belum diatur"}
                </td>
                <td>
                  <div className="toolbar">
                    <button
                      className="btn btn-pri btn-sm"
                      onClick={() => onOpen(type)}
                    >
                      Buka
                    </button>
                    <button
                      className="btn btn-sec btn-sm"
                      onClick={() => edit(type)}
                    >
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <Modal
          title={
            editing === "new" ? "Tambah jenis konten" : "Edit jenis konten"
          }
          onClose={() => {
            if (!busy) setEditing(null);
          }}
        >
          <form className="stack" onSubmit={save}>
            <label className="field">
              Nama jenis
              <input
                autoFocus
                required
                maxLength={190}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              Jenis teks
              <select
                value={engine}
                disabled={editing !== "new"}
                onChange={(e) => {
                  const next = e.target.value as ContentType["engine"];
                  setEngine(next);
                  if (next === "quote") {
                    setOutputs(["POST_IMAGE"]);
                    setSettings(planSettings(["POST_IMAGE"], settings));
                  }
                }}
              >
                <option value="quote">Quote</option>
                <option value="book">Buku</option>
                <option value="news">Berita teknologi</option>
              </select>
            </label>
            <ContentPlanFields
              quote={engine === "quote"}
              outputs={outputs}
              settings={settings}
              onChange={(next, value) => {
                setOutputs(next);
                setSettings(value);
              }}
            />
            {error && (
              <p className="warn" role="alert">
                {error}
              </p>
            )}
            <button
              className="btn btn-pri"
              disabled={busy || !name.trim() || !outputs.length}
            >
              {busy ? "Menyimpan…" : "Simpan"}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
