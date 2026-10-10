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
    const enabled = mode
      ? mode === "template"
      : imageType(kind) !== "ready_video";
    return (
      <label className="check-row">
        <input
          type="checkbox"
          aria-label={`Pakai teks video ${horizontal ? "horizontal" : "vertikal"}`}
          checked={enabled}
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
                {label}
              </label>
            ),
          )}
        </div>
      </fieldset>
      {!quote &&
        outputs.some((key) => key === "PANEL" || key.startsWith("VIDEO_")) && (
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
      <div className="settings-grid">
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
  return (
    <section className="card pad stack">
      <h2 className="h3">{type.name}</h2>
      <label className="check-row">
        <input
          type="checkbox"
          checked={!!settings.articleConfig}
          onChange={(e) =>
            setSettings((s) => ({
              ...s,
              articleConfig: e.target.checked
                ? {
                    ...defaultArticleConfig(type.engine),
                    paragraphCount:
                      type.engine === "book"
                        ? 6
                        : type.engine === "quote"
                          ? 1
                          : null,
                  }
                : undefined,
            }))
          }
        />
        Konfigurasi bahan dan struktur artikel
      </label>
      {settings.articleConfig && (
        <ArticleConfigFields
          value={settings.articleConfig}
          book={type.engine === "book"}
          quote={type.engine === "quote"}
          onChange={(value) =>
            setSettings((s) => ({ ...s, articleConfig: value }))
          }
        />
      )}
      <ContentPlanFields
        outputs={outputs}
        quote={type.engine === "quote"}
        settings={settings}
        onChange={(next, value) => {
          setOutputs(next);
          setSettings(value);
        }}
      />
      {children?.(settings, (patch) =>
        setSettings((s) => ({ ...s, ...patch })),
      )}
      {error && (
        <p role="alert" className="warn">
          {error}
        </p>
      )}
      <div>
        <button
          className="btn btn-pri"
          disabled={busy}
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
          {busy ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </section>
  );
}
