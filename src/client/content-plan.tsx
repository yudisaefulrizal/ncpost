import { VoiceSelect } from "./voices";
import { ArticleConfigFields, defaultArticleConfig } from "./article-config";
import React, { useEffect, useState } from "react";
import {
  FINAL_OUTPUTS,
  isFinalOutput,
  normalizeContentType,
  type ContentType,
} from "../server/content-type-domain";
import {
  DEFAULT_BOOK_SETTINGS,
  isHorizontalKind,
  type BookSettings,
} from "../server/book-settings";
import { LabPromptSettings } from "./lab-prompt-settings";
import { useImageCatalog } from "./image-catalog";

export function finalTargets(outputs: string[]) {
  const targets = outputs.filter(isFinalOutput);
  return targets.length ? targets : ["POST_IMAGE"];
}
export function planSettings(
  outputs: string[],
  previous: BookSettings | null,
): BookSettings {
  const settings = previous ?? DEFAULT_BOOK_SETTINGS;
  return normalizeContentType({
    name: "Konten",
    engine: "book",
    outputs,
    settings: {
      ...settings,
      managed: true,
      autoProcess: false,
      singleImageMode: settings.singleImageMode || "direct",
      carouselMode: settings.carouselMode || "template",
      wholeTextImageKind: settings.wholeTextImageKind ?? null,
      stockKinds: [],
      sentenceKinds: [],
      panelHorizontal: outputs.includes("PANEL")
        ? settings.panelHorizontal ||
          (!settings.panelVertical ? "IMAGE_HORIZONTAL" : null)
        : null,
      panelVertical: outputs.includes("PANEL") ? settings.panelVertical : null,
      sentenceVideoKind: outputs.includes("VIDEO_KALIMAT")
        ? settings.sentenceVideoKind || "IMAGE_VERTICAL"
        : null,
      sentenceVideoHKind: outputs.includes("VIDEO_KALIMAT_H")
        ? settings.sentenceVideoHKind || "IMAGE_HORIZONTAL"
        : null,
    },
  }).settings;
}
export function ContentPlanFields({
  outputs,
  settings,
  onChange,
  quote = false,
}: {
  outputs: string[];
  quote?: boolean;
  settings: BookSettings;
  onChange: (outputs: string[], settings: BookSettings) => void;
}) {
  const { lanes, horizontalKinds, verticalKinds, laneName, imageType, usage } =
    useImageCatalog();
  const set = (patch: Partial<BookSettings>) => {
    const next = { ...settings, ...patch };
    next.carouselMode =
      usage(next.panelVertical || next.panelHorizontal) === "carousel" ||
      imageType(next.panelVertical || next.panelHorizontal) === "ready_post"
        ? "direct"
        : "template";
    next.singleImageMode =
      next.wholeTextImageKind?.startsWith("IMAGE_LAB_") ||
      imageType(next.wholeTextImageKind ?? null) === "ready_post"
        ? "direct"
        : "template";
    onChange(outputs, planSettings(outputs, next));
  };
  const select = (
    label: string,
    value: string | null,
    kinds: string[],
    change: (kind: string) => void,
    optional = false,
  ) => (
    <label className="field">
      {label}
      <select
        aria-label={label}
        value={value || ""}
        onChange={(e) => change(e.target.value)}
      >
        {optional && <option value="">Infografis</option>}
        {value && !kinds.includes(value) && (
          <option value={value}>{laneName(value)} (tidak tersedia)</option>
        )}
        {kinds.map((kind) => (
          <option key={kind} value={kind}>
            {laneName(kind)}
          </option>
        ))}
      </select>
    </label>
  );
  const videoText = (horizontal: boolean) => {
    const mode = horizontal
      ? settings.sentenceVideoHMode
      : settings.sentenceVideoMode;
    const kind = horizontal
      ? settings.sentenceVideoHKind
      : settings.sentenceVideoKind;
    const ready =
      imageType(kind) === "ready_post" || imageType(kind) === "ready_video";
    const enabled = !ready && mode !== "direct";
    return (
      <label className="check-row">
        <input
          type="checkbox"
          aria-label={`Pakai teks video ${horizontal ? "horizontal" : "vertikal"}`}
          checked={enabled}
          disabled={ready}
          onChange={(e) =>
            set(
              horizontal
                ? {
                    sentenceVideoHMode: e.target.checked
                      ? "template"
                      : "direct",
                  }
                : {
                    sentenceVideoMode: e.target.checked ? "template" : "direct",
                  },
            )
          }
        />
        Pakai teks video {horizontal ? "horizontal" : "vertikal"}
      </label>
    );
  };
  return (
    <div className="stack">
      {outputs.some((output) => output.startsWith("VIDEO_")) && (
        <VoiceSelect
          value={settings.audioVoiceId}
          onChange={(audioVoiceId) => set({ audioVoiceId })}
        />
      )}
      <fieldset className="output-targets">
        <legend>Target output</legend>
        <div className="output-target-options">
          {FINAL_OUTPUTS.filter(([key]) => !quote || key === "POST_IMAGE").map(
            ([key, label]) => (
              <label key={key} className="check-row">
                <input
                  type="checkbox"
                  checked={outputs.includes(key)}
                  disabled={outputs.length === 1 && outputs.includes(key)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...outputs, key]
                      : outputs.filter((k) => k !== key);
                    if (next.length)
                      onChange(next, planSettings(next, settings));
                  }}
                />
                <OutputIcon kind={key} />
                <span>{label}</span>
              </label>
            ),
          )}
        </div>
      </fieldset>
      <div className="settings-grid">
        {!quote &&
          outputs.some(
            (key) => key === "PANEL" || key.startsWith("VIDEO_"),
          ) && (
            <label className="field">
              Unit gambar
              <select
                value={settings.imageUnit || ""}
                onChange={(e) =>
                  set({
                    imageUnit: e.target.value
                      ? (e.target.value as BookSettings["imageUnit"])
                      : undefined,
                  })
                }
              >
                <option value="">Mengikuti penggunaan prompt</option>
                <option value="article">Seluruh artikel</option>
                <option value="paragraph">Per paragraf</option>
                <option value="sentence">Per kalimat</option>
              </select>
            </label>
          )}

        {outputs.includes("VIDEO_KALIMAT") &&
          select(
            "Gaya gambar video vertikal",
            settings.sentenceVideoKind,
            verticalKinds,
            (kind) => set({ sentenceVideoKind: kind }),
          )}
        {outputs.includes("VIDEO_KALIMAT_H") &&
          select(
            "Gaya gambar video horizontal",
            settings.sentenceVideoHKind,
            horizontalKinds,
            (kind) => set({ sentenceVideoHKind: kind }),
          )}
        {outputs.includes("VIDEO_KALIMAT") && videoText(false)}
        {outputs.includes("VIDEO_KALIMAT_H") && videoText(true)}
        {outputs.includes("PANEL") &&
          select(
            "Gaya gambar carousel",
            settings.panelVertical || settings.panelHorizontal,
            lanes
              .filter(([kind]) => imageType(kind) !== "ready_video")
              .map(([kind]) => kind),
            (kind) =>
              set({
                panelHorizontal: isHorizontalKind(kind) ? kind : null,
                panelVertical: isHorizontalKind(kind) ? null : kind,
              }),
          )}
        {outputs.includes("POST_IMAGE") &&
          select(
            "Gaya 1 gambar",
            settings.wholeTextImageKind ?? null,
            lanes
              .filter(([kind]) => imageType(kind) !== "ready_video")
              .map(([kind]) => kind),
            (kind) => set({ wholeTextImageKind: kind || null }),
            true,
          )}
      </div>
    </div>
  );
}
export function ContentPlanCard({
  type,
  onSave,
  children,
}: {
  type: ContentType;
  onSave: (outputs: string[], settings: BookSettings) => Promise<void>;
  children?: (
    settings: BookSettings,
    set: (patch: Partial<BookSettings>) => void,
    outputs: string[],
  ) => React.ReactNode;
}) {
  const [outputs, setOutputs] = useState(() => finalTargets(type.outputs));
  const [settings, setSettings] = useState(() =>
    planSettings(finalTargets(type.outputs), type.settings),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const next = finalTargets(type.outputs);
    setOutputs(next);
    setSettings(planSettings(next, type.settings));
  }, [JSON.stringify(type)]);
  const originalOutputs = finalTargets(type.outputs);
  const originalSettings = planSettings(originalOutputs, type.settings);
  const dirty =
    JSON.stringify(outputs) !== JSON.stringify(originalOutputs) ||
    JSON.stringify(settings) !== JSON.stringify(originalSettings);
  const reset = () => {
    setOutputs(originalOutputs);
    setSettings(originalSettings);
    setError("");
  };
  return (
    <section className="card content-settings">
      <div className="content-settings-context">{type.name}</div>
      <fieldset disabled={busy} className="content-settings-fields">
        <section className="content-settings-section article-settings">
          <div className="content-settings-section-head">
            <h2>Artikel</h2>
            <label className="check-row config-switch">
              <input
                type="checkbox"
                checked={!!settings.articleConfig}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    articleConfig: e.target.checked
                      ? defaultArticleConfig(type.engine)
                      : undefined,
                  }))
                }
              />
              Konfigurasi artikel
            </label>
          </div>
          {settings.articleConfig && (
            <ArticleConfigFields
              value={settings.articleConfig}
              book={type.engine === "book"}
              quote={type.engine === "quote"}
              news={type.engine === "news"}
              onChange={(value) =>
                setSettings((s) => ({ ...s, articleConfig: value }))
              }
            />
          )}
          <details className="content-settings-prompt">
            <summary>Prompt artikel</summary>
            <LabPromptSettings
              engine={type.engine}
              images={false}
              selected={settings.labPromptIds || []}
              onChange={(ids) =>
                setSettings((s) => ({ ...s, labPromptIds: ids }))
              }
            />
          </details>
        </section>
        <section className="content-settings-section output-settings">
          <h2>Output & gambar</h2>
          <ContentPlanFields
            outputs={outputs}
            quote={type.engine === "quote"}
            settings={settings}
            onChange={(next, value) => {
              setOutputs(next);
              setSettings(value);
            }}
          />
        </section>
        {children && (
          <section className="content-settings-section publication-settings">
            <h2>Publikasi</h2>
            {children(
              settings,
              (patch) => setSettings((s) => ({ ...s, ...patch })),
              outputs,
            )}
          </section>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="warn content-settings-error">
          {error}
        </p>
      )}
      <div className="content-settings-footer">
        <span className="muted" role="status">
          {busy
            ? "Menyimpan…"
            : dirty
              ? "Perubahan belum disimpan"
              : "Semua perubahan tersimpan"}
        </span>
        <div className="toolbar">
          <button
            className="btn btn-sec"
            disabled={busy || !dirty}
            onClick={reset}
          >
            Batal
          </button>
          <button
            className="btn btn-pri"
            disabled={busy || !dirty}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await onSave(outputs, settings);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Menyimpan…" : "Simpan perubahan"}
          </button>
        </div>
      </div>
    </section>
  );
}
function OutputIcon({ kind }: { kind: string }) {
  return (
    <svg
      className="output-choice-icon"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      {kind === "VIDEO_KALIMAT" ? (
        <>
          <rect x="7" y="2" width="10" height="20" rx="2" />
          <path d="M11 18h2" />
        </>
      ) : kind === "VIDEO_KALIMAT_H" ? (
        <>
          <rect x="2" y="4" width="20" height="13" rx="2" />
          <path d="M12 17v4M8 21h8" />
        </>
      ) : kind === "PANEL" ? (
        <>
          <rect x="3" y="5" width="16" height="16" rx="2" />
          <path d="M7 2h14v15M3 15l5-5 4 4 3-2 4 4" />
        </>
      ) : (
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="m3 16 6-6 4 4 3-3 5 6" />
        </>
      )}
    </svg>
  );
}
