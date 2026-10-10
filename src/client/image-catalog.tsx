import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { HORIZONTAL_KINDS, VERTICAL_KINDS } from "../server/book-settings";
import { QUOTE_IMAGE_STYLES } from "../server/quote-prompt";
import type { LabImageCatalog } from "../server/lab-image-types";
const builtins = [
  ["IMAGE_HORIZONTAL", "Realistic horizontal", "1920 × 1080"],
  ["IMAGE_VERTICAL", "Realistic vertikal", "1080 × 1920"],
  ["IMAGE_MINIMALIST", "Minimalist vertikal", "1080 × 1920 · line art"],
  ["IMAGE_PAPERCUT", "Layered paper cut vertikal", "1080 × 1920 · paper cut"],
  [
    "IMAGE_PAPERCUT_HORIZONTAL",
    "Layered paper cut horizontal",
    "1920 × 1080 · paper cut",
  ],
];
function catalog(lab: LabImageCatalog, reload: () => Promise<void>) {
  const lanes = [
    ...builtins,
    ...lab.stock.map((type) => [
      type.kind,
      `${type.name}${type.imageType === "ready_post" ? " · siap posting" : type.imageType === "ready_video" ? " · siap jadi video" : ""}`,
      type.imageType === "ready_post"
        ? "1080 × 1350"
        : type.orientation === "horizontal"
          ? "1920 × 1080"
          : "1080 × 1920",
    ]),
  ];
  const quoteStyles = {
    ...QUOTE_IMAGE_STYLES,
    ...Object.fromEntries(
      lab.quote
        .filter((type) => type.imageType !== "ready_video")
        .map((type) => [type.kind, { label: type.name }]),
    ),
  };
  return {
    lanes,
    imageType: (key: string | null) =>
      key
        ? lab.stock.find((type) => type.kind === key)?.imageType ||
          "illustration"
        : "ready_post",
    usage: (key: string | null) =>
      lab.stock.find((type) => type.kind === key)?.usage,
    quoteStyles,
    horizontalKinds: [
      ...HORIZONTAL_KINDS,
      ...lab.stock
        .filter(
          (type) =>
            type.orientation === "horizontal" &&
            (type.imageType !== "ready_post" || type.usage === "video"),
        )
        .map((type) => type.kind),
    ],
    verticalKinds: [
      ...VERTICAL_KINDS,
      ...lab.stock
        .filter(
          (type) =>
            type.orientation === "vertikal" &&
            (type.imageType !== "ready_post" || type.usage === "video"),
        )
        .map((type) => type.kind),
    ],
    laneName: (key: string | null) =>
      lanes.find(([id]) => id === key)?.[1] || key || "Tidak ada",
    reload,
  };
}
const Context = createContext(
  catalog({ stock: [], quote: [] }, async () => {}),
);
export const useImageCatalog = () => useContext(Context);
export function ImageCatalogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [lab, setLab] = useState<LabImageCatalog>({ stock: [], quote: [] });
  const reload = useCallback(async () => {
    const response = await fetch("/api/lab/image-types");
    if (response.status === 401) return;
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "Gagal memuat jenis gambar");
    setLab(data);
  }, []);
  useEffect(() => {
    const update = () => {
      void reload().catch(() => {});
    };
    update();
    window.addEventListener("lab-prompts-changed", update);
    return () => window.removeEventListener("lab-prompts-changed", update);
  }, [reload]);
  return (
    <Context.Provider value={catalog(lab, reload)}>{children}</Context.Provider>
  );
}
