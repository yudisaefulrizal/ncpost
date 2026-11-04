import React, { useEffect, useState } from "react";
import { api } from "./api";

const histories = new Map<string, { expires: number; data: Promise<any[]> }>();
function loadZernioHistory(scope?: number) {
  const key = String(scope ?? "default");
  let saved = histories.get(key);
  if (!saved || saved.expires < Date.now()) {
    saved = {
      expires: Date.now() + 5000,
      data: api("/zernio/posts", "GET", undefined, scope),
    };
    histories.set(key, saved);
  }
  return saved.data;
}
export function ZernioCell({
  source,
  title,
  platform,
  accountId,
  ready,
  detailed = false,
  scope,
  blocked = false,
}: {
  source: string;
  title: string;
  platform: "youtube" | "tiktok";
  accountId: string | null;
  ready: boolean;
  detailed?: boolean;
  scope?: number;
  blocked?: boolean;
}) {
  const call = (url: string, method = "GET", body?: unknown) =>
    api(url, method, body, scope);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [latest, setLatest] = useState<any>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  useEffect(() => {
    let current = true;
    setLatest(null);
    setActionError("");
    setLoading(true);
    const refresh = () =>
      loadZernioHistory(scope)
        .then(async (rows) => {
          const match = rows.find(
            (p) =>
              p.source_key.startsWith(source + ":") &&
              p.platform === platform &&
              p.account_id === accountId,
          );
          const latest =
            match ||
            (accountId
              ? (
                  await call(
                    "/zernio/posts?" +
                      new URLSearchParams({ source, platform, accountId }),
                  )
                )[0]
              : null);
          if (current) {
            setError("");
            setLatest(latest);
          }
        })
        .catch((e) => {
          if (current) setError(e.message);
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    void refresh();
    const timer = detailed ? setInterval(refresh, 15000) : undefined;
    window.addEventListener("zernio-publication", refresh);
    return () => {
      current = false;
      clearInterval(timer);
      window.removeEventListener("zernio-publication", refresh);
    };
  }, [source, platform, accountId, scope, detailed]);
  useEffect(() => {
    if (
      !Number.isSafeInteger(latest?.id) ||
      ["published", "failed", "draft", "cancelled", "canceled"].includes(
        latest.status,
      )
    )
      return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await call(`/zernio/posts/${latest.id}/refresh`, "POST");
        if (!active) return;
        setLatest((previous: any) =>
          previous?.id === latest.id
            ? { ...previous, status: result.status, result }
            : previous,
        );
        setError("");
        histories.delete(String(scope ?? "default"));
        if (
          ["published", "failed", "draft", "cancelled", "canceled"].includes(
            result.status,
          )
        )
          return;
      } catch (error) {
        if (active) setError((error as Error).message);
      }
      if (active) timer = setTimeout(poll, 10000);
    };
    timer = setTimeout(poll, 3000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [latest?.id, source, platform, accountId, scope]);
  const publish = async (repostId?: number, retryId?: number) => {
    if (publishing) return;
    setPublishing(true);
    setActionError("");
    try {
      await call("/zernio/posts", "POST", {
        quickTikTok: platform === "tiktok",
        quickYouTube: platform === "youtube",
        source,
        ...(repostId ? { repostOf: repostId } : {}),
        ...(retryId ? { retryOf: retryId } : {}),
      });
      setLatest(null);
      setLoading(true);
      histories.delete(String(scope ?? "default"));
      window.dispatchEvent(new Event("zernio-publication"));
    } catch (error) {
      setActionError((error as Error).message);
      histories.delete(String(scope ?? "default"));
      window.dispatchEvent(new Event("zernio-publication"));
    } finally {
      setPublishing(false);
    }
  };
  const detail = latest?.result?.platforms?.find(
    (p: any) => p.platform === platform,
  );
  const url =
    typeof detail?.url === "string" && /^https:\/\//.test(detail.url)
      ? detail.url
      : null;
  const labels: Record<string, string> = {
    published: "Terbit",
    failed: "Gagal",
    publishing: "Mengunggah",
    pending: "Menunggu",
    queued: "Menunggu",
    processing: "Diproses",
    draft: "Draft",
    cancelled: "Dibatalkan",
    canceled: "Dibatalkan",
  };
  return (
    <>
      <div className="stage-cell">
        <button
          className={detailed ? "btn btn-sec btn-sm" : "play"}
          disabled={
            publishing ||
            loading ||
            (detailed && (!!error || blocked)) ||
            !!latest ||
            !ready ||
            !accountId
          }
          aria-label={`Publikasi ${platform} ${title}`}
          title={
            !accountId
              ? "Pilih akun di Pengaturan Konten"
              : !ready
                ? "Butuh video atau panel selesai"
                : `Publikasi ${platform}`
          }
          onClick={() => {
            if (!latest) void publish();
          }}
        >
          {publishing ? (
            <span className="spinner" />
          ) : detailed ? (
            "Posting"
          ) : latest ? (
            "◉"
          ) : (
            "▶"
          )}
        </button>
        {latest?.status === "published" && (
          <button
            className="play redo"
            title="Post ulang"
            aria-label={`Post ulang ${platform} ${title}`}
            disabled={publishing || blocked || !ready || !accountId}
            onClick={() => {
              if (
                !confirm(
                  `Post ulang "${title}" ke ${platform}? Ini akan membuat postingan baru.`,
                )
              )
                return;
              void publish(latest.id);
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M21 7v6h-6M3 17a9 9 0 0 1 15-10l3 6" />
            </svg>
          </button>
        )}
        <small>
          {loading
            ? "Memuat status…"
            : error
              ? "Perlu diperiksa"
              : latest?.status
                ? detailed
                  ? labels[latest.status] || latest.status
                  : latest.status
                : !accountId
                  ? "Pilih akun di Pengaturan Konten"
                  : !ready
                    ? "Video belum siap"
                    : "Siap diposting"}
        </small>
      </div>
      {detailed && latest?.status === "failed" && (
        <button
          className="btn btn-sec btn-sm"
          disabled={
            publishing || loading || blocked || !ready || !accountId || !!error
          }
          onClick={() => {
            if (confirm(`Coba lagi publikasi “${title}” ke ${platform}?`))
              void publish(undefined, latest.id);
          }}
        >
          Coba lagi
        </button>
      )}
      {detailed && url && (
        <a href={url} target="_blank" rel="noopener noreferrer">
          Lihat postingan
        </a>
      )}
      {detailed && detail?.error && (
        <small className="warn">{detail.error}</small>
      )}
      {error && <small className="warn">{error}</small>}
      {actionError && (
        <small className="warn" role="alert">
          {actionError}
        </small>
      )}
    </>
  );
}
