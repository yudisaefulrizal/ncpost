import React, { useEffect, useState } from "react";
import { api } from "./api";
import type { ContentType } from "../server/content-type-domain";

type Video = {
  key: string;
  title: string;
  origin: string;
  horizontal: boolean;
  url: string;
};
export async function loadFinishedVideos(): Promise<Video[]> {
  const types: ContentType[] = await api("/content-types");
  const groups = await Promise.all(
    types.map(async (type) => {
      const rows = await api(
        type.engine !== "news" ? "/chapters" : "/news",
        "GET",
        undefined,
        type.id,
      );
      return rows.flatMap((row: any) =>
        [false, true].flatMap((horizontal) => {
          const stage = horizontal ? "VIDEO_KALIMAT_H" : "VIDEO_KALIMAT";
          const raw =
            type.engine !== "news"
              ? row[horizontal ? "sentence_video_h" : "sentence_video"]
              : row.production?.outputs[stage];
          if (!raw) return [];
          const manifest = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (!manifest?.file) return [];
          const base =
            type.engine !== "news"
              ? `/api/video-kalimat${horizontal ? "-h" : ""}/${row.id}/${encodeURIComponent(manifest.file)}`
              : `/api/news/${row.id}/media/${stage}/0`;
          return [
            {
              key: `${type.engine}:${row.id}:${stage}`,
              title: row.title,
              origin: type.name,
              horizontal,
              url: `${base}?v=${encodeURIComponent(manifest.renderedAt || "")}`,
            },
          ];
        }),
      );
    }),
  );
  return groups.flat();
}
export function FinishedVideos() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let pending = false;
    const load = async () => {
      if (pending) return;
      pending = true;
      try {
        const next = await loadFinishedVideos();
        if (active) {
          setVideos(next);
          setError("");
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <div className="stack-lg">
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="muted">Memuat…</p>
      ) : !videos.length && !error ? (
        <section className="card pad">
          <div className="empty">
            Belum ada konten video. Buat video di halaman Produksi.
          </div>
        </section>
      ) : null}
      <div className="video-grid">
        {videos.map((video) => (
          <section key={video.key} className="card pad stack">
            <div>
              <h2 className="h3">{video.title}</h2>
              <small className="muted">
                {video.origin} · {video.horizontal ? "Horizontal" : "Vertikal"}
              </small>
            </div>
            <video
              className={`reels-player ${video.horizontal ? "wide" : "tall"}`}
              controls
              preload="metadata"
              src={video.url}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
