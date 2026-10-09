import {
  ContentTypeStore,
  currentContentType,
  withContentType,
  contentAllows,
  contentTypeUpdate,
} from "./content-types";
import { labRouter } from "./lab-routes";
import { LabStore } from "./lab";
import { validateZernioSettings } from "./zernio";
import { zernioRouter } from "./zernio-routes";
import { NewsCronStore } from "./news-cron";
import { newsTtsConfig } from "./edge-tts";
import { newsKinds, NEWS_MEDIA_STAGES } from "./news-production-domain";
import { NewsMediaStore } from "./news-media-store";
import { NewsStore } from "./news-store";
import { selectInstagramAccount } from "./instagram-account";
import express from "express";
import path from "node:path";
import { initConfig, ROOT } from "./config";
import { Store, type Chapter } from "./store";
import { CTA_ROOT, overlayPath, safeFile, templates } from "./templates";
import {
  allowedOrigin,
  RateLimiter,
  sessionToken,
  validSession,
  verifyPassword,
} from "./auth";
import { validateArticle, instagramCaption, bookKey } from "./domain";
import {
  STOCK_KINDS,
  normalizeBookSettings,
  isStockKind,
} from "./book-settings";
import {
  audioDir,
  chapterDir,
  outputRoot,
  panelDir,
  quoteImagePath,
} from "./output-paths";
import { runCli, accounts, publish, postStatus } from "./providers";
import { credentialStatus, setCredential } from "./credentials";
const cfg = initConfig(),
  app = express(),
  limit = new RateLimiter();
app.disable("x-powered-by");
// Impor JSON boleh lebih besar (maks 500 entri); parser pertama yang membaca
// body menang, jadi ini harus dipasang sebelum parser umum.
app.use("/api/chapters/import", express.json({ limit: "512kb" }));
app.use("/api/lab", express.json({ limit: "256kb" }));
app.use(express.json({ limit: "64kb" }));
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    !allowedOrigin(req.get("origin") ?? null)
  )
    return void res.status(403).json({ error: "Origin mutation ditolak" });
  next();
});
// Satu-satunya rute publik non-shell: NC-WA/Meta mengunduh MP4 tanpa cookie.
// Hanya nama acak 128-bit di output/public, tidak ada traversal atau listing.
app.get("/pub/:name", (req, res) => {
  const name = String(req.params.name);
  const m = /^[a-f0-9]{32}\.(mp4|jpg)$/.exec(name);
  if (!m) return void res.sendStatus(404);
  res
    .type(m[1] === "jpg" ? "image/jpeg" : "video/mp4")
    .sendFile(path.join(ROOT, "output/public", name), (e) =>
      e && !res.headersSent ? res.sendStatus(404) : undefined,
    );
});
let store: Store;
let vite: any;
const cookie = (value: string) =>
  `ncpost_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === "production" && process.env.PUBLIC_HTTPS === "true" ? "; Secure" : ""}`;
app.post("/api/login", async (req, res) => {
  if (!limit.take(req.socket.remoteAddress ?? "local"))
    return void res.status(429).json({ error: "Terlalu banyak percobaan" });
  const { email, password } = req.body ?? {};
  const user =
    typeof email === "string" && typeof password === "string"
      ? await store.userByEmail(email)
      : undefined;
  if (!user || !verifyPassword(password, user.password_hash))
    return void res.status(401).json({ error: "Email atau password salah" });
  res.setHeader(
    "Set-Cookie",
    cookie(sessionToken({ uid: user.id, email: user.email }, cfg.secret)),
  );
  res.json({ ok: true, email: user.email });
});
app.use("/api", (req, res, next) => {
  const token =
    (req.headers.cookie ?? "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("ncpost_session="))
      ?.slice(15) ?? "";
  const user = validSession(token, cfg.secret);
  if (!user) return void res.status(401).json({ error: "Silakan masuk" });
  res.locals.user = user;
  next();
});
app.get("/api/content-types", async (_, res) =>
  res.json(await new ContentTypeStore(store.db).list()),
);
app.post("/api/content-types", async (req, res) => {
  const value = contentTypeUpdate(req.body);
  await validateZernioSettings(value.settings, {
    ...value.settings,
    youtubeAccountId: null,
    tiktokAccountId: null,
  });
  if (value.settings.instagramAccountId)
    selectInstagramAccount(value.settings.instagramAccountId, await accounts());
  res.status(201).json(await new ContentTypeStore(store.db).save(value));
});
app.put("/api/content-types/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1)
    throw Error("ID jenis konten tidak valid");
  const current = await new ContentTypeStore(store.db).get(id);
  const value = contentTypeUpdate(req.body, current);
  await validateZernioSettings(
    value.settings,
    current.settings ?? {
      ...value.settings,
      youtubeAccountId: null,
      tiktokAccountId: null,
    },
  );
  if (
    value.settings.instagramAccountId &&
    value.settings.instagramAccountId !== current.settings?.instagramAccountId
  )
    selectInstagramAccount(value.settings.instagramAccountId, await accounts());
  res.json(await new ContentTypeStore(store.db).save(req.body, id));
});
app.use("/api", async (req, res, next) => {
  if (
    !/^\/(chapters|books|book-settings|book-crons|jobs|news|news-settings|news-crons)(\/|$)/.test(
      req.path,
    )
  )
    return next();
  const header = req.get("X-Content-Type-Id");
  let id =
    header === undefined
      ? req.path.startsWith("/news")
        ? 2
        : 1
      : Number(header);
  if (!Number.isSafeInteger(id) || id < 1)
    throw Error("ID jenis konten tidak valid");
  const owner = /^\/(chapters|news)\/(\d+)(?:\/|$)/.exec(req.path);
  if (owner) {
    const [rows]: any = await store.db.query(
      `SELECT content_type_id FROM ${owner[1] === "chapters" ? "chapters" : "news_articles"} WHERE id=?`,
      [Number(owner[2])],
    );
    if (!rows[0])
      return void res.status(404).json({ error: "Konten tidak ditemukan" });
    if (header !== undefined && id !== rows[0].content_type_id)
      return void res
        .status(404)
        .json({ error: "Konten tidak ditemukan pada jenis ini" });
    id = rows[0].content_type_id;
  }
  const type = await new ContentTypeStore(store.db).get(id);
  if (
    (req.path.startsWith("/news") && type.engine !== "news") ||
    (/^\/(chapters|books|book-settings|book-crons)/.test(req.path) &&
      type.engine !== "book")
  )
    throw Error("Sumber artikel tidak sesuai jenis konten");
  if (
    req.path.endsWith("crons") &&
    req.method === "PUT" &&
    req.body?.enabled &&
    !contentAllows(type, req.body.kind)
  )
    throw Error("Tahap tidak digunakan oleh jenis konten ini");
  withContentType(type, next);
});
app.use(
  "/api/zernio",
  zernioRouter(() => store),
);
app.use(
  "/api/lab",
  labRouter(() => new LabStore(store.db)),
);
app.get("/api/session", (_, res) =>
  res.json({ authenticated: true, email: res.locals.user.email }),
);
app.post("/api/logout", (_, res) => {
  res.setHeader(
    "Set-Cookie",
    "ncpost_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
  );
  res.json({ ok: true });
});
app.get("/api/news", async (_, res) => {
  const media = new NewsMediaStore(store.db);
  const news = await new NewsStore(store.db).list();
  res.json(
    await Promise.all(
      news.map(async (n) => ({
        ...n,
        production: await media.detail(n.id, n.attempts),
        settings: await media.settings(
          n.category,
          store.db,
          n.content_type_id ?? 2,
        ),
      })),
    ),
  );
});
app.get("/api/news-crons", async (_, res) =>
  res.json(await new NewsCronStore(store.db).list()),
);
app.put("/api/news-crons", async (req, res) => {
  if (
    req.body?.enabled === true &&
    ["POST_IG", "REELS_IG"].includes(req.body.kind)
  )
    selectInstagramAccount(
      (await new NewsMediaStore(store.db).settings()).instagramAccountId,
      await accounts(),
    );
  res.json(await new NewsCronStore(store.db).save(req.body));
});
app.post("/api/news/:id/publications/:kind/refresh", async (req, res) => {
  const id = Number(req.params.id),
    kind = String(req.params.kind);
  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !["POST_IG", "REELS_IG"].includes(kind)
  )
    throw Error("Publikasi berita tidak valid");
  const [news]: any = await store.db.query(
    "SELECT attempts FROM news_articles WHERE id=?",
    [id],
  );
  if (!news[0]) throw Error("Berita tidak ditemukan");
  const media = new NewsMediaStore(store.db),
    p = await media.detail(id, news[0].attempts),
    old = p.outputs[kind];
  if (!old?.requestId) throw Error("Belum ada request publikasi");
  const r = await postStatus(old.requestId);
  const result = {
    ...old,
    status: String(r.status),
    mediaId: r.mediaId ?? null,
  };
  await media.updatePublication(id, kind, old.requestId, result);
  res.json(result);
});
app.get("/api/news-settings", async (_, res) =>
  res.json([
    {
      category: "teknologi",
      book: "Teknologi",
      settings: await new NewsMediaStore(store.db).settings(),
    },
  ]),
);
app.put("/api/news-settings", async (req, res) => {
  const category = req.body?.category;
  const normalized = normalizeBookSettings(req.body?.settings);
  const media = new NewsMediaStore(store.db);
  const current = await media.settings(category);
  await validateZernioSettings(normalized, current);
  if (
    normalized.instagramAccountId &&
    normalized.instagramAccountId !== current.instagramAccountId
  )
    selectInstagramAccount(normalized.instagramAccountId, await accounts());
  res.json({
    category,
    settings: await media.saveSettings(category, normalized),
  });
});
app.post("/api/news/:id/jobs", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw Error("ID berita tidak valid");
  const media = new NewsMediaStore(store.db);
  const stage = req.body?.kind;
  const kinds = NEWS_MEDIA_STAGES.some(([key]) => key === stage)
    ? newsKinds(stage, await media.settings())
    : [stage];
  res.status(202).json({
    ids: await media.enqueueMany(id, kinds, req.body?.replace === true),
  });
});
app.get("/api/news/:id/media/:kind/:index", async (req, res) => {
  const id = Number(req.params.id),
    index = Number(req.params.index),
    kind = String(req.params.kind);
  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    ![
      "POST_IMAGE",
      "PANEL",
      "TTS_KALIMAT",
      "VIDEO_KALIMAT",
      "VIDEO_KALIMAT_H",
    ].includes(kind)
  )
    return void res.sendStatus(404);
  const [news]: any = await store.db.query(
    "SELECT attempts FROM news_articles WHERE id=?",
    [id],
  );
  if (!news[0]) return void res.sendStatus(404);
  const p = await new NewsMediaStore(store.db).detail(id, news[0].attempts);
  const m = p.outputs[kind];
  const file =
    kind === "PANEL"
      ? index === 4
        ? m?.closing
        : m?.panels?.[index]?.file
      : kind === "TTS_KALIMAT"
        ? m?.sentences?.[index]?.file
        : index === 0
          ? m?.file
          : null;
  if (typeof file !== "string") return void res.sendStatus(404);
  res.sendFile(
    safeFile(path.join(outputRoot(), "berita/media"), path.join(ROOT, file)),
  );
});
app.post("/api/news", async (_, res) =>
  res.status(201).json({ id: await new NewsStore(store.db).create() }),
);
app.post("/api/news/:id/retry", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw Error("ID berita tidak valid");
  await new NewsStore(store.db).retry(id);
  res.json({ ok: true });
});
app.post("/api/news/:id/regenerate", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw Error("ID berita tidak valid");
  await new NewsStore(store.db).regenerate(id);
  res.json({ ok: true });
});
app.get("/api/chapters", async (_, res) => res.json(await store.list()));
app.post("/api/chapters", async (req, res) => {
  const { book, title } = req.body ?? {};
  if (typeof book !== "string" || typeof title !== "string")
    throw Error("Judul buku dan judul bagian wajib diisi");
  res.status(201).json({ id: await store.create(book, title) });
});
app.post("/api/chapters/import", async (req, res) => {
  res.json(
    await store.importChapters(req.body?.items, req.body?.dryRun === true),
  );
});
app.delete("/api/chapters/:id", async (req, res) => {
  await store.remove(Number(req.params.id));
  res.json({ ok: true });
});
app.put("/api/chapters/:id/part", async (req, res) => {
  res.json(
    await store.setPartNumber(Number(req.params.id), Number(req.body?.part)),
  );
});
app.post("/api/books/renumber", async (req, res) => {
  if (typeof req.body?.book !== "string") throw Error("Judul buku wajib diisi");
  res.json(await store.renumberBook(req.body.book));
});
app.get("/api/chapters/:id/caption", async (req, res) => {
  const c = await store.chapter(Number(req.params.id));
  if (!c) return void res.status(404).json({ error: "Bagian tidak ditemukan" });
  res.json({ caption: instagramCaption(c.article) });
});
app.get("/api/chapters/:id", async (req, res) => {
  const c = await store.chapter(Number(req.params.id));
  if (!c) return void res.status(404).json({ error: "Bagian tidak ditemukan" });
  res.json({
    ...c,
    validation: validateArticle(c.article),
    stock: await store.stock(c.id),
  });
});
app.put("/api/chapters/:id", async (req, res) => {
  if (typeof req.body.article !== "string") throw Error("Artikel diperlukan");
  await store.save(Number(req.params.id), req.body.article);
  res.json({ ok: true });
});
app.post("/api/chapters/:id/jobs", async (req, res) => {
  const id = await store.enqueue(
    Number(req.params.id),
    req.body.kind,
    req.body.replace === true,
  );
  res.status(202).json({ id });
});
app.get("/api/jobs", async (_, res) => res.json(await store.jobs()));
app.get("/api/book-crons", async (_, res) => res.json(await store.bookCrons()));
app.put("/api/book-crons", async (req, res) => {
  if (typeof req.body?.book !== "string") throw Error("Judul buku wajib diisi");
  res.json(await store.saveBookCron(req.body.book, req.body));
});

// Pengaturan Konten: satu baris per judul buku yang ada di daftar bagian.
app.get("/api/book-settings", async (_, res) => {
  const books = new Map<string, string>();
  for (const c of await store.list())
    if (!books.has(bookKey(c.book))) books.set(bookKey(c.book), c.book);
  res.json(
    await Promise.all(
      [...books.values()].map(async (book) => ({
        book,
        settings: await store.bookSettings(book),
      })),
    ),
  );
});
app.put("/api/book-settings", async (req, res) => {
  const { book, settings } = req.body ?? {};
  if (typeof book !== "string") throw Error("Judul buku wajib diisi");
  const normalized = normalizeBookSettings(settings);
  const current = await store.bookSettings(book);
  await validateZernioSettings(normalized, current);
  if (
    normalized.instagramAccountId &&
    normalized.instagramAccountId !== current.instagramAccountId
  )
    selectInstagramAccount(normalized.instagramAccountId, await accounts());
  res.json({ book, settings: await store.saveBookSettings(book, normalized) });
});
app.get("/api/templates", (_, res) =>
  res.json(
    templates.map((t) => ({
      ...t,
      url: `/api/templates/${t.id}/1`,
      blocked: t.vertical ? "Membutuhkan stok portrait asli" : null,
    })),
  ),
);
app.get("/api/templates/:id/:panel", (req, res) =>
  res.sendFile(overlayPath(String(req.params.id), Number(req.params.panel))),
);
app.get("/api/cta", (_, res) =>
  res.sendFile(
    safeFile(
      CTA_ROOT,
      path.join(CTA_ROOT, "minimalist-line-art-cta/slide-penutup-cta.png"),
    ),
  ),
);
// Berkas hasil render per bagian: URL tetap memakai id, jalurnya dicari dari
// buku dan nomor bagian (lihat output-paths.ts).
function chapterFile(
  route: string,
  allowed: RegExp,
  resolve: (c: Chapter, file: string) => string,
) {
  app.get(route, async (req, res) => {
    const file = String(req.params.file ?? "quote.jpg");
    if (!/^\d+$/.test(String(req.params.id)) || !allowed.test(file))
      return void res.sendStatus(404);
    const c = await store.chapter(Number(req.params.id));
    if (!c) return void res.sendStatus(404);
    res.sendFile(safeFile(outputRoot(), resolve(c, file)));
  });
}
chapterFile("/api/audio-kalimat/:id/:file", /^kalimat_\d{2}\.mp3$/, (c, file) =>
  path.join(audioDir(c), file),
);
chapterFile("/api/video-kalimat-h/:id/:file", /^video-h\.mp4$/, (c, file) =>
  path.join(chapterDir(c), file),
);
chapterFile("/api/video-kalimat/:id/:file", /^video-v\.mp4$/, (c, file) =>
  path.join(chapterDir(c), file),
);
app.get("/api/text-image/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return void res.sendStatus(404);
  const c = await store.chapter(id);
  if (!c?.text_image) return void res.sendStatus(404);
  const image = JSON.parse(c.text_image);
  if (
    typeof image.file !== "string" ||
    !/^gambar-teks-r\d+-j\d+\.jpg$/.test(image.file)
  )
    return void res.sendStatus(404);
  res
    .type("jpg")
    .sendFile(safeFile(outputRoot(), path.join(chapterDir(c), image.file)));
});
chapterFile("/api/quote-image/:id", /^quote\.jpg$/, (c) => quoteImagePath(c));
chapterFile(
  "/api/panels/:id/:file",
  /^(?:direct-r\d+-j\d+-)?0[1-7]-(panel|slide-penutup)\.(jpg|png)$/,
  (c, file) => path.join(panelDir(c), file),
);
app.get("/api/media/:job/:file", (req, res) => {
  if (
    !/^\d+$/.test(String(req.params.job)) ||
    !/^panel-[1-6]\.png$/.test(String(req.params.file))
  )
    return void res.sendStatus(404);
  res.sendFile(
    safeFile(
      path.join(ROOT, "output"),
      path.join(
        ROOT,
        "output/work",
        String(req.params.job),
        String(req.params.file),
      ),
    ),
  );
});
app.get("/api/stock", async (req, res) => {
  const kind = String(req.query.kind);
  if (!isStockKind(kind)) throw Error("Lajur stok tidak dikenal");
  res.json(
    (await store.assets(kind)).map(
      ({ id, description, usage, created_at }) => ({
        id,
        description,
        usage,
        created_at,
        url: `/api/stock/${id}/image`,
      }),
    ),
  );
});
app.get("/api/stock/:id/image", async (req, res) => {
  const a = /^\d+$/.test(String(req.params.id))
    ? await store.assetById(Number(req.params.id))
    : undefined;
  if (!a) return void res.sendStatus(404);
  res.sendFile(
    safeFile(path.join(ROOT, "output/stock"), path.join(ROOT, a.file)),
  );
});
app.get("/api/settings", async (_, res) => {
  let login = "Belum diperiksa";
  try {
    const result = await runCli(
      process.env.CODEX_EXECUTABLE || "codex",
      ["login", "status"],
      "",
      ROOT,
      10000,
      true,
    );
    login = result.includes("Logged in using ChatGPT")
      ? "Login ChatGPT terverifikasi"
      : "Login CLI belum terverifikasi";
  } catch {
    login = "CLI/login tidak tersedia";
  }
  res.json({
    origin: "http://127.0.0.1:8072",
    publicOrigin: "https://ncpost.nuscode.id",
    codex: {
      login,
      text: "Live text NCPOST_TEXT_OK diverifikasi parent",
      image:
        "Live PNG CLI diverifikasi parent; adapter memvalidasi keluaran thread dan rasio. --image hanya input",
    },
    tts: {
      enabled: cfg.liveTts,
      reason: cfg.liveTts
        ? "ElevenLabs aktif"
        : "Live TTS diblokir (LIVE_TTS=false)",
      model: "eleven_v3",
    },
    newsTts: (({ enabled, provider, voice, rate, reason }) => ({
      enabled,
      provider,
      voice,
      rate,
      reason,
    }))(newsTtsConfig()),
    ncwa: await accounts(),
    reels: "Reels aktif melalui NC-WA (videoUrl publik)",
  });
});
app.get("/api/instagram/accounts", async (_, res) =>
  res.json(await accounts()),
);
app.get("/api/credentials", (_, res) => res.json(credentialStatus()));
app.put("/api/credentials", (req, res) => {
  const values = req.body?.values;
  if (!values || typeof values !== "object")
    throw Error("Data kredensial diperlukan");
  for (const [name, value] of Object.entries(values))
    if (value !== null && value !== "") setCredential(name, value as string);
  res.json(credentialStatus());
});
app.post("/api/publish", async (req, res) => {
  res.status(202).json(await publish(req.body));
});
app.get("/api/publish/:requestId", async (req, res) =>
  res.json(await postStatus(String(req.params.requestId))),
);
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return void res.sendStatus(404);
  next();
});
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(ROOT, "dist")));
  app.get("/{*path}", (_, res) =>
    res.sendFile(path.join(ROOT, "dist/index.html")),
  );
} else {
  app.use((req, res, next) =>
    vite ? vite.middlewares(req, res, next) : res.status(503).send("Starting"),
  );
}
app.use(
  (
    error: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    res.status(400).json({
      error: error?.message?.startsWith("ENOENT")
        ? "Aset tidak tersedia"
        : (error?.message ?? "Operasi gagal"),
    });
  },
);
const server = app.listen(8072, "127.0.0.1", async () => {
  store = new Store();
  if (process.env.NODE_ENV !== "production") {
    const { createServer } = await import("vite");
    vite = await createServer({
      server: { middlewareMode: true, allowedHosts: ["ncpost.nuscode.id"] },
      appType: "spa",
    });
  }
  console.log("NC Post: http://127.0.0.1:8072 — worker terpisah");
});
server.on("error", () => {
  console.error("Port 8072 tidak tersedia; proses berhenti tanpa worker");
  process.exit(1);
});
const shutdown = () => {
  server.close(async () => {
    await vite?.close();
    await store?.close();
    process.exit(0);
  });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
