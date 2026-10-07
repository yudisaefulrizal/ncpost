import express from "express";
import path from "node:path";
import { initConfig, ROOT } from "./config";
import { Store } from "./store";
import { CTA_ROOT, overlayPath, safeFile, templates } from "./templates";
import {
  allowedOrigin,
  RateLimiter,
  sessionToken,
  validSession,
  verifyPassword,
} from "./auth";
import { validateArticle, instagramCaption, bookKey } from "./domain";
import { STOCK_KINDS } from "./book-settings";
import { runCli, accounts, publish, postStatus } from "./providers";
import { credentialStatus, setCredential } from "./credentials";
const cfg = initConfig(),
  app = express(),
  limit = new RateLimiter();
app.disable("x-powered-by");
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
app.get("/api/chapters", async (_, res) => res.json(await store.list()));
app.post("/api/chapters", async (req, res) => {
  const { book, title } = req.body ?? {};
  if (typeof book !== "string" || typeof title !== "string")
    throw Error("Judul buku dan judul bagian wajib diisi");
  res.status(201).json({ id: await store.create(book, title) });
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
  res.json({ book, settings: await store.saveBookSettings(book, settings) });
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
app.get("/api/audio-kalimat/:id/:file", (req, res) => {
  if (
    !/^\d+$/.test(String(req.params.id)) ||
    !/^kalimat_\d{2}\.mp3$/.test(String(req.params.file))
  )
    return void res.sendStatus(404);
  res.sendFile(
    safeFile(
      path.join(ROOT, "output/audio-kalimat"),
      path.join(ROOT, "output/audio-kalimat", req.params.id, req.params.file),
    ),
  );
});
app.get("/api/video-kalimat-h/:id/:file", (req, res) => {
  if (
    !/^\d+$/.test(String(req.params.id)) ||
    !/^reels_video\.mp4$/.test(String(req.params.file))
  )
    return void res.sendStatus(404);
  res.sendFile(
    safeFile(
      path.join(ROOT, "output/video-kalimat-h"),
      path.join(ROOT, "output/video-kalimat-h", req.params.id, req.params.file),
    ),
  );
});
app.get("/api/video-kalimat/:id/:file", (req, res) => {
  if (
    !/^\d+$/.test(String(req.params.id)) ||
    !/^reels_video\.mp4$/.test(String(req.params.file))
  )
    return void res.sendStatus(404);
  res.sendFile(
    safeFile(
      path.join(ROOT, "output/video-kalimat"),
      path.join(ROOT, "output/video-kalimat", req.params.id, req.params.file),
    ),
  );
});
app.get("/api/quote-image/:id", (req, res) => {
  if (!/^\d+$/.test(String(req.params.id))) return void res.sendStatus(404);
  res.sendFile(
    safeFile(
      path.join(ROOT, "output/quote-images"),
      path.join(ROOT, "output/quote-images", req.params.id, "quote.jpg"),
    ),
  );
});
app.get("/api/panels/:id/:file", (req, res) => {
  if (
    !/^\d+$/.test(String(req.params.id)) ||
    !/^0[1-7]-(panel|slide-penutup)\.(jpg|png)$/.test(String(req.params.file))
  )
    return void res.sendStatus(404);
  res.sendFile(
    safeFile(
      path.join(ROOT, "output/panels"),
      path.join(ROOT, "output/panels", req.params.id, req.params.file),
    ),
  );
});
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
  if (!(STOCK_KINDS as readonly string[]).includes(kind))
    throw Error("Lajur stok tidak dikenal");
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
    ncwa: await accounts(),
    reels: "Reels aktif melalui NC-WA (videoUrl publik)",
  });
});
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
