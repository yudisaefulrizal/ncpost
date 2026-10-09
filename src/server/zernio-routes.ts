import { writeEnvValue } from "./credentials";
import { NewsMediaStore } from "./news-media-store";
import { Router } from "express";
import path from "node:path";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import type { Store } from "./store";
import { ROOT } from "./config";
import { chapterDir, outputRoot, panelDir } from "./output-paths";
import { safeFile } from "./templates";
import {
  zernioAccounts,
  zernioCreatorInfo,
  zernioId,
  zernioPlatform,
  zernioPostBody,
  zernioPostSummary,
  zernioRequest,
} from "./zernio";

async function mediaLibrary(store: Store) {
  const videos: {
    key: string;
    title: string;
    files: string[];
    previews: string[];
    mediaType: "video" | "photo";
    version: string;
  }[] = [];
  for (const c of await store.list()) {
    for (const [field, orientation] of [
      ["sentence_video", "v"],
      ["sentence_video_h", "h"],
    ] as const) {
      if (!c[field]) continue;
      const m = JSON.parse(c[field]!);
      if (typeof m.file !== "string") continue;
      videos.push({
        key: `book:${c.id}:${orientation}`,
        title: `${c.book} · ${c.title} · ${orientation.toUpperCase()}`,
        files: [path.join(chapterDir(c), m.file)],
        mediaType: "video",
        previews: [
          `/api/video-kalimat${orientation === "h" ? "-h" : ""}/${c.id}/video-${orientation}.mp4`,
        ],
        version: `${c.revision}:${m.renderedAt}:${m.file}`,
      });
    }
    if (c.panels) {
      const m = JSON.parse(c.panels);
      const files = [
        ...(m.panels || []).map((p: any) => p.file),
        m.closing,
      ].filter((f): f is string => typeof f === "string");
      if (files.length >= 2)
        videos.push({
          key: `book:${c.id}:photo`,
          title: `${c.book} · ${c.title} · Carousel`,
          files: files.map((f) => path.join(panelDir(c), f)),
          previews: files.map(
            (f) => `/api/panels/${c.id}/${encodeURIComponent(f)}`,
          ),
          mediaType: "photo",
          version: `${c.revision}:${m.renderedAt}:${JSON.stringify(files)}`,
        });
    }
  }
  const [news]: any = await store.db.query(
    "SELECT n.id,n.title,n.attempts,o.kind,o.data FROM news_articles n JOIN news_media_outputs o ON o.news_id=n.id AND o.revision=n.attempts WHERE o.kind IN ('VIDEO_KALIMAT','VIDEO_KALIMAT_H','PANEL')",
  );
  for (const n of news) {
    const m = JSON.parse(n.data);
    if (n.kind === "PANEL") {
      const files = [
        ...(m.panels || []).map((p: any) => p.file),
        m.closing,
      ].filter((f): f is string => typeof f === "string");
      if (files.length >= 2)
        videos.push({
          key: `news:${n.id}:photo`,
          title: `Berita · ${n.title} · Carousel`,
          files: files.map((f) => path.join(ROOT, f)),
          previews: files.map((_, i) => `/api/news/${n.id}/media/PANEL/${i}`),
          mediaType: "photo",
          version: `${n.attempts}:${m.renderedAt}:${JSON.stringify(files)}`,
        });
      continue;
    }
    if (typeof m.file !== "string") continue;
    videos.push({
      key: `news:${n.id}:${n.kind === "VIDEO_KALIMAT_H" ? "h" : "v"}`,
      title: `Berita · ${n.title} · ${n.kind === "VIDEO_KALIMAT_H" ? "H" : "V"}`,
      files: [path.join(ROOT, m.file)],
      mediaType: "video",
      previews: [`/api/news/${n.id}/media/${n.kind}/0`],
      version: `${n.attempts}:${m.renderedAt}:${m.file}`,
    });
  }
  return videos;
}
export function zernioRouter(getStore: () => Store) {
  const router = Router();
  router.get("/accounts", async (_, res) => res.json(await zernioAccounts()));
  router.get("/profiles", async (_, res) => {
    const data = await zernioRequest("/profiles");
    res.json({
      selectedProfileId: process.env.ZERNIO_PROFILE_ID || null,
      profiles: (data.profiles || []).map((p: any) => ({
        id: zernioId(p._id),
        name: String(p.name),
      })),
    });
  });
  router.post("/profile", async (req, res) => {
    const id = zernioId(req.body?.profileId);
    const data = await zernioRequest("/profiles");
    if (
      !Array.isArray(data.profiles) ||
      !data.profiles.some((p: any) => p._id === id)
    )
      throw Error("Profil Zernio tidak tersedia");
    writeEnvValue(path.join(ROOT, ".env"), "ZERNIO_PROFILE_ID", id);
    process.env.ZERNIO_PROFILE_ID = id;
    res.json({ selectedProfileId: id });
  });
  router.post("/profiles", async (req, res) => {
    const name = req.body?.name;
    if (typeof name !== "string" || !name.trim() || name.length > 100)
      throw Error("Nama profil wajib diisi, maksimal 100 karakter");
    const data = await zernioRequest("/profiles", {
      method: "POST",
      body: JSON.stringify({ name: name.trim() }),
    });
    res.json({
      id: zernioId(data.profile?._id),
      name: String(data.profile?.name),
    });
  });
  router.post("/connect", async (req, res) => {
    const platform = zernioPlatform(req.body?.platform);
    const profileId = zernioId(process.env.ZERNIO_PROFILE_ID);
    if (req.body?.profileId !== profileId)
      throw Error(
        "Pilih dan simpan profil Zernio di Kredensial terlebih dahulu",
      );
    const data = await zernioRequest(
      `/connect/${platform}?${new URLSearchParams({ profileId })}`,
    );
    const url = new URL(data.authUrl);
    if (url.protocol !== "https:" || url.username || url.password)
      throw Error("URL otorisasi Zernio tidak valid");
    res.json({ authUrl: url.href });
  });
  router.get("/creator/:id", async (req, res) => {
    const id = zernioId(req.params.id);
    const connection = await zernioAccounts();
    if (
      !connection.accounts.some((a) => a.id === id && a.platform === "tiktok")
    )
      throw Error("Akun TikTok tidak ditemukan");
    res.json(
      await zernioCreatorInfo(
        id,
        req.query.mediaType === "photo" ? "photo" : "video",
      ),
    );
  });
  router.get("/media", async (_, res) =>
    res.json(
      (await mediaLibrary(getStore())).map(({ files, version, ...v }) => v),
    ),
  );
  router.get("/posts", async (_, res) => {
    const [rows]: any = await getStore().db.query(
      "SELECT id,source_key,title,platform,account_id,post_id,status,result,created_at FROM zernio_publications ORDER BY id DESC LIMIT 100",
    );
    res.json(
      rows.map((r: any) => ({
        ...r,
        result: r.result ? JSON.parse(r.result) : null,
      })),
    );
  });
  router.post("/posts", async (req, res) => {
    const store = getStore();
    const input = req.body;
    const id = zernioId(input?.accountId);
    const connection = await zernioAccounts();
    const account = connection.accounts.find((a) => a.id === id);
    if (!account) throw Error("Pilih akun YouTube/TikTok yang aktif");
    const video = (await mediaLibrary(store)).find(
      (v) => v.key === (input.mediaKey || input.videoKey),
    );
    if (!video) throw Error("Konten hasil produksi tidak ditemukan");
    const [sourceType, sourceId] = video.key.split(":");
    const chapter =
      sourceType === "book" ? await store.chapter(Number(sourceId)) : null;
    const [newsRows]: any =
      sourceType === "news"
        ? await store.db.query(
            "SELECT content_type_id FROM news_articles WHERE id=?",
            [Number(sourceId)],
          )
        : [[]];
    const settings =
      sourceType === "book" && chapter
        ? await store.bookSettings(
            chapter.book,
            store.db,
            chapter.content_type_id ?? 1,
          )
        : await new NewsMediaStore(store.db).settings(
            "teknologi",
            store.db,
            newsRows[0]?.content_type_id ?? 2,
          );
    const targetId =
      account.platform === "youtube"
        ? settings.youtubeAccountId
        : settings.tiktokAccountId;
    if (targetId !== account.id)
      throw Error("Akun tujuan harus sesuai Pengaturan Konten yang tersimpan");
    if (video.mediaType === "photo" && account.platform !== "tiktok")
      throw Error("YouTube hanya mendukung video");
    const sources = video.files.map((file) => safeFile(outputRoot(), file));
    const names = sources.map(
      () =>
        randomBytes(16).toString("hex") +
        (video.mediaType === "photo" ? ".jpg" : ".mp4"),
    );
    const origin = process.env.PUBLIC_ORIGIN || "https://ncpost.nuscode.id";
    const urls = names.map((name) => new URL(`/pub/${name}`, origin));
    if (urls.some((url) => url.protocol !== "https:"))
      throw Error("Domain publik HTTPS diperlukan untuk mengirim video");
    const body = await zernioPostBody(
      input,
      video.mediaType === "photo" ? urls.map((url) => url.href) : urls[0].href,
      account,
    );
    const fingerprint = createHash("sha256")
      .update(JSON.stringify([video.key, video.version, account.id]))
      .digest("hex");
    mkdirSync(path.join(ROOT, "output/public"), {
      recursive: true,
      mode: 0o700,
    });
    let publicationId: number;
    try {
      const [insert]: any = await store.db.query(
        "INSERT INTO zernio_publications(fingerprint,source_key,title,platform,account_id) VALUES(?,?,?,?,?)",
        [
          fingerprint,
          video.key,
          video.title.slice(0, 500),
          account.platform,
          account.id,
        ],
      );
      publicationId = insert.insertId;
    } catch (error: any) {
      if (error.code === "ER_DUP_ENTRY")
        throw Error(
          "Konten ini sudah dikirim ke akun tersebut. Periksa riwayat dan status posting.",
        );
      throw error;
    }
    try {
      sources.forEach((source, i) =>
        copyFileSync(source, path.join(ROOT, "output/public", names[i])),
      );
    } catch (error) {
      names.forEach((name) =>
        rmSync(path.join(ROOT, "output/public", name), { force: true }),
      );
      await store.db.query("DELETE FROM zernio_publications WHERE id=?", [
        publicationId,
      ]);
      throw error;
    }
    try {
      const data = await zernioRequest("/posts", {
        method: "POST",
        headers: { "x-request-id": fingerprint },
        body: JSON.stringify(body),
      });
      const result = zernioPostSummary(data);
      await store.db.query(
        "UPDATE zernio_publications SET post_id=?,status=?,result=? WHERE id=?",
        [result.id, result.status, JSON.stringify(result), publicationId],
      );
      res.status(201).json(result);
    } catch {
      await store.db.query(
        "UPDATE zernio_publications SET status='unknown' WHERE id=?",
        [publicationId],
      );
      throw Error(
        "Hasil pengiriman belum dapat dipastikan. Periksa dashboard Zernio sebelum mengirim ulang; riwayat tersimpan.",
      );
    }
  });
  router.post("/posts/:id/refresh", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1)
      throw Error("ID publikasi tidak valid");
    const [rows]: any = await getStore().db.query(
      "SELECT post_id FROM zernio_publications WHERE id=?",
      [id],
    );
    if (!rows[0]?.post_id)
      throw Error("ID posting belum tersedia; periksa dashboard Zernio");
    const result = zernioPostSummary(
      await zernioRequest(`/posts/${zernioId(rows[0].post_id)}`),
    );
    await getStore().db.query(
      "UPDATE zernio_publications SET status=?,result=? WHERE id=?",
      [result.status, JSON.stringify(result), id],
    );
    res.json(result);
  });
  return router;
}
