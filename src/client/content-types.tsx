import { Modal } from "./modal";
import React, { useState, createContext, useContext } from "react";
import {
  CONTENT_OUTPUTS,
  type ContentType,
} from "../server/content-type-domain";
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
  const [engine, setEngine] = useState<"book" | "news">("book");
  const [outputs, setOutputs] = useState<string[]>(["ARTICLE"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const edit = (type: ContentType | "new") => {
    setEditing(type);
    setName(type === "new" ? "" : type.name);
    setEngine(type === "new" ? "book" : type.engine);
    setOutputs(type === "new" ? ["ARTICLE"] : type.outputs);
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
        { name, engine, outputs },
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
              <th>Keluaran</th>
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
                  {CONTENT_OUTPUTS.filter(([key]) => type.outputs.includes(key))
                    .map(([, label]) => label)
                    .join(", ")}
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
              Sumber artikel
              <select
                value={engine}
                disabled={editing !== "new"}
                onChange={(e) => {
                  setEngine(e.target.value as "book" | "news");
                  setOutputs(["ARTICLE"]);
                }}
              >
                <option value="book">Buku</option>
                <option value="news">Berita teknologi</option>
              </select>
            </label>
            <div className="stack-sm">
              <b>Keluaran</b>
              {CONTENT_OUTPUTS.filter(
                ([key]) =>
                  engine === "book" || !["QUOTE", "QUOTE_IMAGE"].includes(key),
              ).map(([key, label]) => (
                <label key={key} className="check-row">
                  <input
                    type="checkbox"
                    checked={outputs.includes(key)}
                    onChange={(e) =>
                      setOutputs((values) =>
                        e.target.checked
                          ? [...values, key]
                          : values.filter((k) => k !== key),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
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
