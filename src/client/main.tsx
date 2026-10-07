import {
  NEWS_MEDIA_STAGES,
  NEWS_CRON_TYPES,
  emptyNewsProduction,
  newsKinds,
  newsContent,
  newsPrerequisite,
  newsStageDone,
} from "../server/news-production-domain";
import type { NewsArticle } from "../server/news-store";
import {
  selectInstagramAccount,
  type InstagramConnection,
} from "../server/instagram-account";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./style.css";
import { paginateRows } from "./pagination";
import {
  validateArticle,
  partNumber,
  bookKey,
  articleSentences,
  PANEL_COUNT,
} from "../server/domain";
import {
  DEFAULT_BOOK_SETTINGS,
  sentenceJob,
  HORIZONTAL_KINDS,
  VERTICAL_KINDS,
  panelSources,
  type BookSettings,
} from "../server/book-settings";
import {
  CRON_TYPES,
  validIntervalHours,
  MAX_INTERVAL_HOURS,
  type BookCron,
} from "../server/cron";
import { QUOTE_IMAGE_STYLES } from "../server/quote-prompt";
import {
  status,
  matchFilter,
  groupByBook,
  ACTION_STATES,
  type Filter,
  type Tone,
} from "./status";
async function api(url: string, method = "GET", body?: unknown) {
  const r = await fetch("/api" + url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Operasi gagal");
  return data;
}
const importJsonExample =
  JSON.stringify(
    [
      { buku: "Judul Buku Pertama", tema: "Judul Bagian 1" },
      { buku: "Judul Buku Pertama", tema: "Judul Bagian 2" },
      { buku: "Judul Buku Kedua", tema: "Judul Bagian 1" },
    ],
    null,
    2,
  ) + "\n";
const navGroups: [string, [string, IconName][]][] = [
  [
    "Konten Buku",
    [
      ["Produksi", "video"],
      ["Pengaturan Konten", "sliders"],
      ["Cronjob", "gear"],
    ],
  ],
  [
    "Konten Berita",
    [
      ["Produksi Berita", "doc"],
      ["Pengaturan Berita", "sliders"],
      ["Cronjob Berita", "gear"],
    ],
  ],
  [
    "Aset",
    [
      ["Stok Gambar", "image"],
      ["Stok Konten Panel", "grid"],
      ["Stok Konten Video", "video"],
    ],
  ],
  [
    "Sistem",
    [
      ["Kredensial", "key"],
      ["Pengaturan", "gear"],
    ],
  ],
];
const filters: [Filter, string][] = [
  ["semua", "Semua"],
  ["tindakan", "Perlu tindakan"],
  ["lanjut", "Siap lanjut"],
  ["belum", "Belum dimulai"],
];
const IMAGE_LANES = [
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
const laneName = (k: string | null) =>
  IMAGE_LANES.find(([id]) => id === k)?.[1] ?? "Tidak ada";
const parse = (s: string | null | undefined) => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};
function App() {
  const [auth, setAuth] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [user, setUser] = useState(""),
    [newBook, setNewBook] = useState(""),
    [newTitle, setNewTitle] = useState(""),
    [viewing, setViewing] = useState<any>(null),
    [viewingStock, setViewingStock] = useState<any>(null),
    [viewingSentence, setViewingSentence] = useState<any>(null),
    [viewingPanel, setViewingPanel] = useState<any>(null),
    [posting, setPosting] = useState<any>(null),
    [postingReels, setPostingReels] = useState<any>(null),
    [bookSettings, setBookSettings] = useState<
      { book: string; settings: BookSettings }[]
    >([]),
    [bookCrons, setBookCrons] = useState<BookCron[]>([]),
    [viewingQuote, setViewingQuote] = useState<any>(null),
    [viewingQuoteImage, setViewingQuoteImage] = useState<any>(null),
    [watching, setWatching] = useState<{
      c: any;
      horizontal?: boolean;
    } | null>(null),
    [listeningSentence, setListeningSentence] = useState<any>(null),
    [msg, setMsg] = useState(""),
    [rows, setRows] = useState<any[]>([]),
    [page, setPage] = useState("Produksi"),
    [detail, setDetail] = useState<any>(null),
    [text, setText] = useState(""),
    [search, setSearch] = useState(""),
    [queuePage, setQueuePage] = useState(1),
    [filter, setFilter] = useState<Filter>("semua"),
    [filterBook, setFilterBook] = useState(""),
    [jobs, setJobs] = useState<any[]>([]),
    [settings, setSettings] = useState<any>(null),
    [instagram, setInstagram] = useState<InstagramConnection>({
      state: "loading",
    }),
    [creds, setCreds] = useState<any>(null),
    [credInput, setCredInput] = useState<Record<string, string>>({});
  const refresh = async () => {
    setRows(await api("/chapters"));
    setJobs(await api("/jobs"));
    setBookSettings(await api("/book-settings"));
    setBookCrons(await api("/book-crons"));
  };
  const settingsFor = (book: string): BookSettings =>
    bookSettings.find((b) => bookKey(b.book) === bookKey(book))?.settings ??
    DEFAULT_BOOK_SETTINGS;
  const count = (c: any, kind: string) => Number(c.stock_counts?.[kind] ?? 0);
  const loadSettings = () =>
    api("/settings")
      .then((r) => {
        setSettings(r);
        setInstagram(r.ncwa);
      })
      .catch(() => {});
  const refreshInstagram = () =>
    action(async () => setInstagram(await api("/instagram/accounts")));
  const instagramTarget = (book: string) => {
    try {
      return {
        account: selectInstagramAccount(
          settingsFor(book).instagramAccountId,
          instagram,
        ),
        error: "",
      };
    } catch (e) {
      return { account: null, error: (e as Error).message };
    }
  };
  useEffect(() => {
    api("/session")
      .then((r) => {
        setUser(r.email);
        setAuth(true);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!auth) return;
    loadSettings();
  }, [auth]);
  useEffect(() => {
    if (!auth) return;
    refresh();
    const timer = setInterval(() => {
      refresh();
      if (detail) api("/chapters/" + detail.id).then(setDetail);
    }, 3000);
    return () => clearInterval(timer);
  }, [auth, detail?.id]);
  const action = async (fn: () => Promise<any>) => {
    try {
      await fn();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  const open = async (c: any) => {
    const d = await api("/chapters/" + c.id);
    setDetail(d);
    setText(d.article);
    setMsg("");
    window.scrollTo(0, 0);
  };
  // Ubah nomor bagian; nomor yang sudah dipakai bagian lain saling ditukar.
  const editPart = (c: any) => {
    const current = partNumber(rows, c);
    const raw = prompt(
      `Nomor bagian untuk "${c.title}" (${c.book}):\nNomor yang sudah dipakai bagian lain akan bertukar.`,
      String(current),
    );
    if (raw === null) return;
    action(async () => {
      const r = await api(`/chapters/${c.id}/part`, "PUT", {
        part: Number(raw.trim()),
      });
      setMsg(
        r.swapped
          ? `Nomor bagian jadi ${r.part}; bagian yang tadi bernomor ${r.part} jadi ${current}. Panel dan video yang terdampak perlu dirender ulang.`
          : r.part === current
            ? "Nomor bagian tidak berubah"
            : `Nomor bagian jadi ${r.part}. Panel dan video bagian ini perlu dirender ulang.`,
      );
      await refresh();
      if (detail?.id === c.id) await open(c);
    });
  };
  // Rapatkan nomor satu buku menjadi 1..N (mis. setelah ada bagian dihapus).
  const renumberBook = (book: string) => {
    const list = rows.filter((r) => bookKey(r.book) === bookKey(book));
    const sorted = [...list].sort(
      (a, b) => partNumber(rows, a) - partNumber(rows, b) || a.id - b.id,
    );
    const willChange = sorted.filter(
      (c, i) => partNumber(rows, c) !== i + 1,
    ).length;
    if (!willChange) {
      setMsg(`Nomor bagian "${book}" sudah berurutan 1–${list.length}`);
      return;
    }
    if (
      !confirm(
        `Urutkan ulang nomor bagian "${book}" menjadi 1–${list.length}?\n` +
          `${willChange} bagian berganti nomor; panel dan video bagian itu perlu dirender ulang.`,
      )
    )
      return;
    action(async () => {
      const r = await api("/books/renumber", "POST", { book });
      setMsg(`${r.changed} dari ${r.total} bagian "${book}" diurutkan ulang`);
      await refresh();
    });
  };
  const removeChapter = (c: any) =>
    confirm(`Hapus bagian "${c.title}"? Artikel dan job-nya ikut terhapus.`) &&
    action(async () => {
      await api("/chapters/" + c.id, "DELETE");
      if (detail?.id === c.id) setDetail(null);
      setMsg("Bagian dihapus");
      await refresh();
    });
  const enqueue = async (kind: string, replace = false) => {
    await api("/chapters/" + detail.id + "/jobs", "POST", { kind, replace });
    setMsg(`Job ${kind} masuk antrean`);
    await refresh();
  };
  // Impor buku dari JSON [{ buku, tema }]: pratinjau dulu, lalu konfirmasi.
  const importJson = async (file: File) => {
    let items: unknown;
    try {
      items = JSON.parse(await file.text());
    } catch {
      throw Error("File bukan JSON yang valid");
    }
    const plan = await api("/chapters/import", "POST", { items, dryRun: true });
    if (!plan.created) {
      setMsg(`Tidak ada bagian baru: ${plan.skipped} entri sudah ada`);
      return;
    }
    if (
      !confirm(
        `Impor ${plan.created} bagian baru dari ${plan.books} buku?` +
          (plan.skipped
            ? `\n${plan.skipped} entri sudah ada dan dilewati.`
            : ""),
      )
    )
      return;
    const r = await api("/chapters/import", "POST", { items });
    setMsg(
      `${r.created} bagian diimpor${r.skipped ? `, ${r.skipped} dilewati` : ""}`,
    );
    await refresh();
  };
  const addChapter = async () => {
    await api("/chapters", "POST", { book: newBook, title: newTitle });
    setNewTitle("");
    setMsg(`Bagian "${newTitle.trim()}" ditambahkan`);
    await refresh();
  };
  // Jalankan tahap langsung dari daftar antrean.
  const runStage = (c: any, kinds: string[], label: string, replace = false) =>
    action(async () => {
      for (const kind of kinds)
        await api("/chapters/" + c.id + "/jobs", "POST", { kind, replace });
      setMsg(`${label}: bagian "${c.title}" masuk antrean`);
      await refresh();
    });
  // Selesai → centang (+ regenerate bila bisa diulang); belum → tombol play.
  const stagePlay = (c: any, stage: string): PlayProps => {
    const busy = (kinds: string[]) =>
      activeJobs.some((j) => j.chapter_id === c.id && kinds.includes(j.kind));
    if (stage === "artikel") {
      const r = articleStage(c, busy);
      return c.article ? { ...r, view: () => setViewing(c) } : r;
    }
    const r = otherStage(c, stage, busy);
    const hasStock = Object.values(c.stock_counts ?? {}).some(
      (n) => Number(n) > 0,
    );
    if (stage === "gambar" && hasStock)
      return {
        ...r,
        view: () => setViewingStock(c),
        viewTitle: "Lihat stok gambar",
      };
    if (stage === "panel" && c.panel_status === "tersedia" && c.panels)
      return { ...r, view: () => setViewingPanel(c), viewTitle: "Lihat panel" };
    if (
      stage === "kalimat" &&
      Object.keys(c.stock_counts ?? {}).some((k) => k.startsWith("S_"))
    )
      return {
        ...r,
        view: () => setViewingSentence(c),
        viewTitle: "Lihat gambar per kalimat",
      };
    return r;
  };
  const articleStage = (
    c: any,
    busy: (kinds: string[]) => boolean,
  ): PlayProps => {
    if (busy(["ARTICLE", "EDITOR"]))
      return { title: "Artikel sedang diproses", busy: true };
    if (!c.article)
      return {
        title: "Buat artikel (tulis, review, revisi otomatis)",
        run: () => runStage(c, ["ARTICLE"], "Buat artikel"),
      };
    if (c.article_status === "siap")
      return {
        title: "Artikel lolos editor",
        done: true,
        redo: () =>
          confirm(
            `Regenerate artikel "${c.title}"? Artikel lama diganti dan stok gambarnya dilepas.`,
          ) && runStage(c, ["ARTICLE"], "Regenerate artikel", true),
      };
    return {
      title:
        c.article_status === "revisi"
          ? "Editor minta revisi — jalankan review ulang"
          : "Jalankan review editor",
      run: () => runStage(c, ["EDITOR"], "Review editor"),
    };
  };
  const otherStage = (
    c: any,
    stage: string,
    busy: (kinds: string[]) => boolean,
  ): PlayProps => {
    if (stage === "quote") {
      if (busy(["QUOTE"])) return { title: "Quote sedang dibuat", busy: true };
      if (c.quote)
        return {
          title: "Quote tersedia",
          done: true,
          redo: () =>
            confirm(`Buat ulang quote "${c.title}"?`) &&
            runStage(c, ["QUOTE"], "Buat ulang quote"),
          view: () => setViewingQuote(c),
          viewTitle: "Lihat quote",
        };
      if (!validateArticle(c.article ?? "").ok)
        return { title: "Butuh artikel final yang valid" };
      return {
        title: "Buat quote dari paragraf artikel",
        run: () => runStage(c, ["QUOTE"], "Buat quote"),
      };
    }
    if (stage === "quoteImage") {
      const style =
        QUOTE_IMAGE_STYLES[settingsFor(c.book).quoteImageStyle]?.label ?? "";
      if (busy(["QUOTE_IMAGE"]))
        return { title: "Gambar quote sedang dibuat", busy: true };
      if (c.quote_image)
        return {
          title: "Gambar quote tersedia",
          done: true,
          redo: () =>
            confirm(`Buat ulang gambar quote "${c.title}" (${style})?`) &&
            runStage(c, ["QUOTE_IMAGE"], "Buat ulang gambar quote"),
          view: () => setViewingQuoteImage(c),
          viewTitle: "Lihat gambar quote",
        };
      if (!c.quote) return { title: "Butuh quote" };
      return {
        title: `Buat gambar quote (${style})`,
        run: () => runStage(c, ["QUOTE_IMAGE"], "Gambar quote"),
      };
    }
    if (stage === "gambar") {
      // Lajur mengikuti Pengaturan Konten buku ini.
      const kinds = settingsFor(c.book).stockKinds;
      if (busy(kinds))
        return { title: "Stok gambar sedang dibuat", busy: true };
      if (c.article_status !== "siap")
        return { title: "Butuh artikel lolos editor" };
      if (kinds.every((k) => count(c, k) >= PANEL_COUNT))
        return {
          title: "Stok gambar tersedia",
          done: true,
          redo: () =>
            confirm(
              `Regenerate stok gambar "${c.title}"? Gambar baru dibuat; gambar lama tetap di kolam stok.`,
            ) && runStage(c, kinds, "Regenerate stok gambar", true),
        };
      const missing = kinds.filter((k) => count(c, k) < PANEL_COUNT);
      return {
        title: `Buat stok gambar: ${missing.map(laneName).join(", ")}`,
        run: () => runStage(c, missing, "Stok gambar"),
      };
    }
    if (stage === "kalimat") {
      // Lajur aktif mengikuti Pengaturan Konten; satu gambar per kalimat.
      const kinds = settingsFor(c.book).sentenceKinds.map(sentenceJob);
      if (!kinds.length)
        return {
          title: "Gambar per kalimat belum diaktifkan di Pengaturan Konten",
        };
      if (busy(kinds))
        return { title: "Gambar per kalimat sedang dibuat", busy: true };
      if (c.article_status !== "siap")
        return { title: "Butuh artikel lolos editor" };
      const n = articleSentences(c.article).length;
      if (kinds.every((k) => count(c, k) >= n))
        return {
          title: "Gambar per kalimat tersedia",
          done: true,
          redo: () =>
            confirm(
              `Regenerate gambar per kalimat "${c.title}"? Gambar baru dibuat; gambar lama tetap di kolam stok.`,
            ) && runStage(c, kinds, "Regenerate gambar kalimat", true),
        };
      const missing = kinds.filter((k) => count(c, k) < n);
      return {
        title: `Buat gambar per kalimat: ${missing
          .map((k) => laneName(k.slice(2)))
          .join(", ")}`,
        run: () => runStage(c, missing, "Gambar kalimat"),
      };
    }
    if (stage === "audioKalimat") {
      if (busy(["TTS_KALIMAT"]))
        return { title: "Audio kalimat sedang dibuat", busy: true };
      if (c.sentence_audio)
        return {
          title: "Audio per kalimat tersedia",
          done: true,
          redo: () =>
            confirm(
              `Buat ulang audio per kalimat "${c.title}"? Kredit ElevenLabs terpakai lagi.`,
            ) && runStage(c, ["TTS_KALIMAT"], "Buat ulang audio kalimat", true),
          view: () => setListeningSentence(c),
          viewTitle: "Dengarkan audio kalimat",
        };
      if (!ttsLive) return { title: "TTS belum aktif (LIVE_TTS=false)" };
      if (c.article_status !== "siap")
        return { title: "Butuh artikel lolos editor" };
      return {
        title: "Buat audio per kalimat (ElevenLabs)",
        run: () => runStage(c, ["TTS_KALIMAT"], "Audio kalimat"),
      };
    }
    if (stage === "videoKalimat") {
      const source = settingsFor(c.book).sentenceVideoKind;
      if (busy(["VIDEO_KALIMAT"]))
        return { title: "Video kalimat sedang dirender", busy: true };
      if (c.sentence_video)
        return {
          title: "Video kalimat tersedia",
          done: true,
          redo: () =>
            runStage(c, ["VIDEO_KALIMAT"], "Render ulang video kalimat"),
          view: () => setWatching({ c }),
          viewTitle: "Tonton video kalimat",
        };
      if (!source)
        return {
          title: "Pilih sumber gambar Video Kalimat di Pengaturan Konten",
        };
      const n = articleSentences(c.article ?? "").length;
      if (c.article_status !== "siap" || count(c, sentenceJob(source)) < n)
        return { title: `Butuh gambar kalimat ${laneName(source)}` };
      if (!c.sentence_audio) return { title: "Butuh audio per kalimat" };
      return {
        title: "Render video per kalimat",
        run: () => runStage(c, ["VIDEO_KALIMAT"], "Video kalimat"),
      };
    }
    if (stage === "videoKalimatH") {
      const source = settingsFor(c.book).sentenceVideoHKind;
      if (busy(["VIDEO_KALIMAT_H"]))
        return {
          title: "Video kalimat horizontal sedang dirender",
          busy: true,
        };
      if (c.sentence_video_h)
        return {
          title: "Video kalimat horizontal tersedia",
          done: true,
          redo: () =>
            runStage(c, ["VIDEO_KALIMAT_H"], "Render ulang video kalimat H"),
          view: () => setWatching({ c, horizontal: true }),
          viewTitle: "Tonton video kalimat horizontal",
        };
      if (!source)
        return {
          title: "Pilih sumber gambar Video Kalimat H di Pengaturan Konten",
        };
      const n = articleSentences(c.article ?? "").length;
      if (c.article_status !== "siap" || count(c, sentenceJob(source)) < n)
        return { title: `Butuh gambar kalimat ${laneName(source)}` };
      if (!c.sentence_audio) return { title: "Butuh audio per kalimat" };
      return {
        title: "Render video per kalimat horizontal (1920×1080)",
        run: () => runStage(c, ["VIDEO_KALIMAT_H"], "Video kalimat H"),
      };
    }
    if (stage === "panel") {
      if (busy(["PANEL"]))
        return { title: "Panel sedang dirender", busy: true };
      if (c.panel_status === "tersedia")
        return {
          title: "Panel siap dipublikasikan",
          done: true,
          redo: () => runStage(c, ["PANEL"], "Render ulang panel"),
        };
      const sources = panelSources(settingsFor(c.book));
      const lacking = sources.filter((k) => count(c, k) < PANEL_COUNT);
      if (c.article_status !== "siap" || lacking.length)
        return {
          title: `Butuh enam stok: ${lacking.map(laneName).join(", ") || "artikel lolos"}`,
        };
      return {
        title: "Render panel (6 panel + slide penutup)",
        run: () => runStage(c, ["PANEL"], "Render panel"),
      };
    }
    const done = (k: string) => String(c[k]).startsWith("tersedia");
    // Post IG = panel sebagai carousel; Reels IG = video.
    if (stage === "post") {
      if (
        busy(["POST_IG"]) ||
        ["preparing", "processing", "publishing"].includes(c.post_status)
      )
        return { title: "Sedang diposting ke Instagram", busy: true };
      if (c.post_status === "published")
        return { title: "Sudah terbit di Instagram", done: true };
      if (c.post_status === "unknown")
        return {
          title:
            "Hasil posting belum pasti — periksa akun Instagram sebelum mencoba lagi",
        };
      if (c.panel_status !== "tersedia") return { title: "Butuh panel" };
      return {
        title:
          c.post_status === "failed"
            ? "Posting sebelumnya gagal — coba lagi"
            : "Post carousel panel ke Instagram",
        run: () => setPosting(c),
      };
    }
    if (
      busy(["REELS_IG"]) ||
      ["preparing", "processing", "publishing"].includes(c.reels_status)
    )
      return { title: "Reels sedang diposting ke Instagram", busy: true };
    if (c.reels_status === "published")
      return { title: "Reels sudah terbit di Instagram", done: true };
    if (c.reels_status === "unknown")
      return {
        title:
          "Hasil Reels belum pasti — periksa akun Instagram sebelum mencoba lagi",
      };
    if (!c.sentence_video) return { title: "Butuh Video" };
    return {
      title:
        c.reels_status === "failed"
          ? "Reels sebelumnya gagal — coba lagi"
          : "Post video sebagai Reels Instagram",
      run: () => setPostingReels(c),
    };
  };
  const go = (n: string) => {
    setPage(n);
    setDetail(null);
    setMsg("");
    if (n === "Kredensial")
      action(async () => setCreds(await api("/credentials")));
    if (n === "Pengaturan") loadSettings();
    if (n === "Pengaturan Konten") refreshInstagram();
    if (n === "Produksi") setFilter("semua");
  };
  useEffect(() => setQueuePage(1), [search, filter, filterBook]);
  const ttsLive = !!settings?.tts?.enabled;
  // Urut per buku (urutan buku pertama kali diinput), lalu per bagian.
  const bookOrder = new Map<string, number>();
  for (const r of rows)
    if (!bookOrder.has(bookKey(r.book)))
      bookOrder.set(bookKey(r.book), bookOrder.size);
  const visible = rows
    .filter(
      (c) =>
        (c.book + " " + c.title).toLowerCase().includes(search.toLowerCase()) &&
        matchFilter(c, filter) &&
        (!filterBook || bookKey(c.book) === filterBook),
    )
    .sort(
      (a, b) =>
        bookOrder.get(bookKey(a.book))! - bookOrder.get(bookKey(b.book))! ||
        partNumber(rows, a) - partNumber(rows, b) ||
        a.id - b.id,
    );
  const queue = paginateRows(visible, queuePage);
  const activeJobs = jobs.filter((x) =>
    ["queued", "running"].includes(x.state),
  );

  if (!auth)
    return (
      <main className="login">
        <div className="login-card card">
          <Brand />
          <h1>Masuk ke ruang kerja</h1>
          <p className="muted">
            Artikel buku, produksi, dan Instagram Reels dalam satu antrean.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                const r = await api("/login", "POST", { email, password });
                setPassword("");
                setUser(r.email);
                setAuth(true);
                setMsg("");
              });
            }}
          >
            <label className="field">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label className="field">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button className="btn btn-pri btn-block">Masuk</button>
          </form>
          {msg && (
            <p role="alert" className="alert alert-block">
              {msg}
            </p>
          )}
          <small className="muted">
            Masuk dengan akun aplikasi. Login ChatGPT dilakukan melalui Codex
            CLI.
          </small>
        </div>
      </main>
    );

  const providerRows = [
    {
      name: "Codex CLI · teks",
      note: settings?.codex?.login ?? "Memeriksa…",
      s: settings
        ? settings.codex.login.includes("terverifikasi") &&
          !settings.codex.login.includes("belum")
          ? status("siap")
          : { tone: "block" as Tone, label: "Periksa" }
        : status("queued"),
    },
    {
      name: "Codex CLI · gambar",
      note: "PNG live terverifikasi; 5 panel belum diuji live",
      s: { tone: "ok" as Tone, label: "Aktif" },
    },
    {
      name: "ElevenLabs",
      note: settings?.tts?.reason ?? "Memeriksa…",
      s: ttsLive
        ? { tone: "ok" as Tone, label: "Aktif" }
        : { tone: "block" as Tone, label: "Diblokir" },
    },
    {
      name: "Instagram · NC-WA",
      note:
        settings?.ncwa?.state === "connected"
          ? (settings.ncwa.accounts ?? [])
              .map((a: any) => "@" + a.username)
              .join(", ") + " · Reels aktif"
          : (settings?.ncwa?.reason ?? "Memeriksa…"),
      s:
        settings?.ncwa?.state === "connected"
          ? { tone: "ok" as Tone, label: "Terhubung" }
          : settings
            ? { tone: "block" as Tone, label: "Terputus" }
            : status("queued"),
    },
  ];

  const queueCard = (
    <section className="card queue">
      <div className="card-head">
        <h2>Antrean bagian</h2>
        <div className="toolbar">
          <div className="search">
            <Icon name="search" />
            <input
              aria-label="Cari buku atau bagian"
              placeholder="Cari buku atau bagian"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="book-filter"
            aria-label="Filter judul buku"
            value={filterBook}
            onChange={(e) => setFilterBook(e.target.value)}
          >
            <option value="">Semua buku</option>
            {[
              ...new Map(rows.map((c) => [bookKey(c.book), c.book])).entries(),
            ].map(([key, book]) => (
              <option key={key} value={key}>
                {book}
              </option>
            ))}
          </select>
          <div className="seg" role="group" aria-label="Filter status">
            {filters.map(([id, label]) => (
              <button
                key={id}
                className={filter === id ? "on" : ""}
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {
        <form
          className="add-chapter"
          onSubmit={(e) => {
            e.preventDefault();
            action(addChapter);
          }}
        >
          <label className="field">
            Judul buku
            <input
              value={newBook}
              onChange={(e) => setNewBook(e.target.value)}
              list="book-list"
              maxLength={255}
              required
            />
            <datalist id="book-list">
              {[...new Set(rows.map((r) => r.book))].map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </label>
          <label className="field grow">
            Judul bagian
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              maxLength={500}
              required
            />
          </label>
          <button className="btn btn-pri">
            <Icon name="plus" />
            Tambah bagian
          </button>
          <label
            className="btn btn-sec"
            title='Impor dari JSON: [{ "buku": "...", "tema": "..." }]'
          >
            <Icon name="doc" />
            Impor JSON
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) action(() => importJson(file));
              }}
            />
          </label>
          <a
            className="btn btn-sec"
            href={`data:application/json;charset=utf-8,${encodeURIComponent(importJsonExample)}`}
            download="contoh-impor-buku.json"
            title="Unduh contoh JSON, lalu ganti buku dan tema sesuai kebutuhan"
          >
            <Icon name="doc" />
            Download contoh JSON
          </a>
        </form>
      }
      <div className="table">
        <table>
          <thead>
            <tr>
              <th>Bagian</th>
              <th>Artikel</th>
              <th>Quote</th>
              <th>Gambar Quote</th>
              <th>Gambar Panel</th>
              <th>Gambar Video</th>
              <th>Audio</th>
              <th>Video V</th>
              <th>Video H</th>
              <th>Panel</th>
              <th>Post IG</th>
              <th>Reels IG</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {groupByBook(queue.items).map((g) => (
              <React.Fragment key={g.book + g.rows[0].id}>
                <tr className="grp">
                  <td colSpan={13}>
                    {g.book}
                    <span>
                      {
                        rows.filter((r) => bookKey(r.book) === bookKey(g.book))
                          .length
                      }{" "}
                      bagian
                    </span>
                    <button
                      className="btn btn-sec btn-sm grp-action"
                      title="Rapatkan nomor bagian menjadi 1, 2, 3, … tanpa celah"
                      onClick={() => renumberBook(g.book)}
                    >
                      Urutkan ulang
                    </button>
                  </td>
                </tr>
                {g.rows.map((c) => (
                  <tr key={c.id} className="row">
                    <td className="title-cell">
                      <span className="mono num">
                        {String(partNumber(rows, c)).padStart(2, "0")}
                      </span>
                      <button
                        className="title-link"
                        aria-label={`Buka bagian ${partNumber(rows, c)} ${c.book}`}
                        title="Buka detail"
                        onClick={() => action(() => open(c))}
                      >
                        {c.title}
                      </button>
                    </td>
                    <td>
                      <StageCell play={stagePlay(c, "artikel")} />
                    </td>
                    <td>
                      <StageCell play={stagePlay(c, "quote")} />
                    </td>
                    <td>
                      <StageCell play={stagePlay(c, "quoteImage")} />
                    </td>
                    <td>
                      <StageCell play={stagePlay(c, "gambar")} />
                    </td>
                    <td>
                      <StageCell play={stagePlay(c, "kalimat")} />
                    </td>
                    <td>
                      <StageCell play={stagePlay(c, "audioKalimat")} />
                    </td>
                    <td>
                      <StageCell play={stagePlay(c, "videoKalimat")} />
                    </td>
                    <td>
                      <StageCell play={stagePlay(c, "videoKalimatH")} />
                    </td>
                    <td>
                      <StageCell play={stagePlay(c, "panel")} />
                    </td>
                    <td>
                      <StageCell play={stagePlay(c, "post")} />
                    </td>
                    <td>
                      <StageCell play={stagePlay(c, "reels")} />
                    </td>
                    <td>
                      <div className="stage-cell">
                        <button
                          className="play redo"
                          title="Ubah nomor bagian"
                          aria-label={`Ubah nomor bagian ${partNumber(rows, c)} ${c.book}`}
                          onClick={() => editPart(c)}
                        >
                          <Icon name="edit" size={14} />
                        </button>
                        <button
                          className="play redo"
                          title={
                            activeJobs.some((j) => j.chapter_id === c.id)
                              ? "Tidak bisa dihapus: masih ada job aktif"
                              : "Hapus bagian"
                          }
                          aria-label={`Hapus bagian ${partNumber(rows, c)} ${c.book}`}
                          disabled={activeJobs.some(
                            (j) => j.chapter_id === c.id,
                          )}
                          onClick={() => removeChapter(c)}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <div className="empty">
            {rows.length
              ? "Tidak ada bagian yang cocok dengan filter."
              : "Belum ada bagian. Isi judul buku dan judul bagian di atas."}
          </div>
        )}
      </div>
      <div className="card-foot" aria-label="Halaman antrean">
        <span>
          Halaman {queue.page} / {queue.pages} · {queue.total} bagian
        </span>
        <div className="row-gap">
          <button
            className="btn btn-sec btn-sm"
            disabled={queue.page <= 1}
            onClick={() => setQueuePage(queue.page - 1)}
          >
            Sebelumnya
          </button>
          <button
            className="btn btn-sec btn-sm"
            disabled={queue.page >= queue.pages}
            onClick={() => setQueuePage(queue.page + 1)}
          >
            Berikutnya
          </button>
        </div>
      </div>
    </section>
  );

  const jobsCard = (
    <section className="card pad">
      <div className="card-title">
        <h2 className="h3">Aktivitas worker</h2>
        <span className="muted small">{activeJobs.length} job aktif</span>
      </div>
      {jobs.length ? (
        <ol className="jobs">
          {jobs.slice(0, 8).map((j) => (
            <li key={j.id}>
              <span className="mono muted">#{j.id}</span>
              <div>
                <b>
                  {jobLabel(j.kind)} ·{" "}
                  {(() => {
                    const ch = rows.find((r) => r.id === j.chapter_id);
                    return ch
                      ? `${ch.book} · Bagian ${partNumber(rows, ch)}`
                      : "Bagian terhapus";
                  })()}
                </b>
                <small className={j.state === "failed" ? "text-block" : ""}>
                  {j.error || "—"}
                </small>
              </div>
              <Chip s={status(j.state)} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">
          Belum ada pekerjaan. Worker dijalankan terpisah dengan npm run worker.
        </p>
      )}
    </section>
  );

  let content: React.ReactNode;
  let heading = page,
    sub = "";
  if (detail) {
    const v = detail.validation ?? {};
    const report = parse(detail.report);
    const preview = parse(detail.preview);
    const passed = report?.checks?.filter(
      (c: any) => c.status === "lulus",
    ).length;
    const visualOk = String(detail.visual_status).startsWith("tersedia");
    const running = activeJobs.filter((j) => j.chapter_id === detail.id);
    heading = detail.title;
    sub = `Revisi ${detail.revision}${report ? ` · editor ${passed}/${report.checks.length}` : ""}`;
    const steps: { name: string; s: { tone: Tone; label: string } }[] = [
      {
        name: "Artikel",
        s: !detail.article
          ? status("belum")
          : v.ok
            ? { tone: "ok", label: "Valid" }
            : { tone: "act", label: "Belum valid" },
      },
      {
        name: "Review editor",
        s:
          detail.article_status === "siap"
            ? { tone: "ok", label: `Lolos ${passed ?? ""}/6` }
            : ACTION_STATES.includes(detail.article_status)
              ? status(detail.article_status)
              : status("belum"),
      },
      {
        name: "Stok gambar",
        s: visualOk
          ? status("tersedia")
          : detail.article_status === "siap"
            ? { tone: "act", label: "Langkah berikutnya" }
            : { tone: "none", label: "Menunggu" },
      },
      {
        name: "Video",
        s: detail.sentence_video
          ? status("tersedia")
          : { tone: "none", label: "Menunggu" },
      },
      { name: "Instagram Reels", s: status(detail.reels_status) },
    ];
    // Satu aksi utama sesuai tahap saat ini.
    const primary: { label: string; hint: string; run?: () => void } =
      !detail.article
        ? {
            label: "Buat artikel",
            hint: "Codex menulis artikel, editor meninjau, lalu review langsung diterapkan.",
            run: () => action(() => enqueue("ARTICLE")),
          }
        : !v.ok
          ? {
              label: "Simpan draf",
              hint: "Struktur belum memenuhi kontrak; perbaiki lalu simpan.",
              run: () => action(saveDraft),
            }
          : ["menunggu editor", "draft", "revisi"].includes(
                detail.article_status,
              )
            ? {
                label: "Jalankan review editor",
                hint:
                  detail.article_status === "revisi"
                    ? "Sunting draf sesuai catatan editor, simpan, lalu review ulang."
                    : "Struktur lolos; review makna wajib sebelum stok gambar.",
                run: () => action(() => enqueue("EDITOR")),
              }
            : !visualOk
              ? {
                  label: "Buat stok gambar",
                  hint: "Artikel lolos editor. Empat lajur stok dibuat terpisah.",
                  run: () =>
                    action(async () => {
                      for (const [k] of IMAGE_LANES) await enqueue(k);
                      setMsg("Empat job stok gambar masuk antrean");
                    }),
                }
              : {
                  label: "",
                  hint: "Audio dan video menunggu ElevenLabs aktif.",
                };
    async function saveDraft() {
      await api("/chapters/" + detail.id, "PUT", { article: text });
      await open(detail);
      setMsg("Draf tersimpan");
      await refresh();
    }
    content = (
      <DetailView
        {...{
          detail,
          part: partNumber(rows, detail),
          text,
          setText,
          v,
          report,
          preview,
          steps,
          primary,
          running,
          ttsLive,
          visualOk,
          settings,
        }}
        onBack={() => setDetail(null)}
        bookSettings={settingsFor(detail.book)}
        onSave={() => action(saveDraft)}
        onDelete={() => removeChapter(detail)}
        onEditPart={() => editPart(detail)}
        onEnqueue={(k: string, replace?: boolean) =>
          action(() => enqueue(k, replace))
        }
      />
    );
  } else if (page === "Produksi Berita") {
    sub =
      "Produksi berita teknologi: artikel, gambar, audio, panel, video, dan Instagram.";
    content = (
      <NewsProduction
        instagram={instagram}
        ttsReady={!!settings?.newsTts?.enabled}
        ttsReason={settings?.newsTts?.reason ?? "Memeriksa Edge TTS berita…"}
      />
    );
  } else if (page === "Pengaturan Berita") {
    sub = "Sumber gambar, video, dan akun Instagram per jenis berita.";
    content = (
      <NewsContentSettings
        instagram={instagram}
        onRefreshInstagram={refreshInstagram}
      />
    );
  } else if (page === "Cronjob Berita") {
    sub =
      "Jadwal otomatis per jenis berita dan tahap produksi, setiap beberapa jam.";
    content = <NewsCronSettings />;
  } else if (page === "Kredensial") {
    sub = "Key khusus aplikasi untuk penyedia eksternal.";
    content = (
      <section className="card pad narrow">
        <h2 className="h3">Kredensial aplikasi</h2>
        <p className="muted">
          Disimpan di file .env server (izin 0600) dan tidak pernah dikirim
          kembali ke browser. Kosongkan kolom untuk membiarkan nilai tersimpan.
          Restart worker agar nilai baru terbaca.
        </p>
        {creds ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              action(async () => {
                setCreds(
                  await api("/credentials", "PUT", { values: credInput }),
                );
                setCredInput({});
                setMsg("Kredensial disimpan");
              });
            }}
          >
            {Object.entries<any>(creds).map(([name, c]) => (
              <label key={name} className="field">
                <span className="field-row">
                  {c.label}
                  <Chip
                    s={
                      c.set
                        ? { tone: "ok", label: "Tersimpan" }
                        : { tone: "none", label: "Belum diatur" }
                    }
                  />
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={c.set ? "••••••••" : ""}
                  value={credInput[name] ?? ""}
                  onChange={(e) =>
                    setCredInput({ ...credInput, [name]: e.target.value })
                  }
                />
              </label>
            ))}
            <div>
              <button className="btn btn-pri">Simpan kredensial</button>
            </div>
          </form>
        ) : (
          <p className="muted">Memuat…</p>
        )}
      </section>
    );
  } else if (page === "Pengaturan") {
    sub = "Koneksi dan kemampuan penyedia.";
    content = (
      <div className="split">
        <section className="card pad grow">
          <h2 className="h3">Penyedia</h2>
          <ProviderList rows={providerRows} />
        </section>
        <section className="card pad side">
          <h2 className="h3">Server</h2>
          {settings ? (
            <dl className="dl">
              <dt>Origin lokal</dt>
              <dd className="mono">{settings.origin}</dd>
              <dt>Domain publik</dt>
              <dd className="mono">{settings.publicOrigin}</dd>
              <dt>Codex teks</dt>
              <dd>{settings.codex.text}</dd>
              <dt>Codex gambar</dt>
              <dd>{settings.codex.image}</dd>
              <dt>TTS</dt>
              <dd>
                {settings.tts.reason} · {settings.tts.model}
              </dd>
              <dt>Instagram</dt>
              <dd>{settings.reels}</dd>
            </dl>
          ) : (
            <p className="muted">Memeriksa status CLI…</p>
          )}
        </section>
      </div>
    );
  } else if (page === "Cronjob") {
    sub =
      "Jadwal otomatis per judul buku dan jenis konten · Asia/Jakarta (WIB).";
    content = (
      <CronSettings
        items={bookCrons}
        onSave={async (cron) => {
          await api("/book-crons", "PUT", cron);
          await refresh();
          setMsg(`Cronjob "${cron.book}" disimpan`);
        }}
      />
    );
  } else if (page === "Pengaturan Konten") {
    sub =
      "Jenis gambar, sumber panel, dan akun Instagram tujuan per judul buku.";
    content = (
      <ContentSettings
        items={bookSettings}
        instagram={instagram}
        onRefreshInstagram={refreshInstagram}
        onSave={(book, settings) =>
          action(async () => {
            await api("/book-settings", "PUT", { book, settings });
            setMsg(`Pengaturan konten "${book}" disimpan`);
            await refresh();
          })
        }
      />
    );
  } else if (page === "Stok Konten Panel") {
    sub =
      "Panel yang sudah dirender, siap dipublikasikan sebagai postingan gambar.";
    content = (
      <PanelContent
        rows={rows.filter((c) => c.panel_status === "tersedia" && c.panels)}
        onOpen={(c: any) => action(() => open(c))}
      />
    );
    content = (
      <div className="stack-lg">
        {content}
        <NewsFinishedContent kind="PANEL" />
      </div>
    );
  } else if (page === "Stok Konten Video") {
    sub =
      "Video final per bagian: 9:16 untuk Reels dan 16:9 untuk platform lain.";
    const videos = rows.filter((c) => c.sentence_video || c.sentence_video_h);
    content = videos.length ? (
      <div className="video-grid">
        {videos.map((c) => (
          <section key={c.id} className="card pad stack">
            <div className="card-title">
              <div>
                <h2 className="h3">{c.title}</h2>
                <small className="muted">{c.book}</small>
              </div>
            </div>
            {[
              ["sentence_video", "video-kalimat", "tall"],
              ["sentence_video_h", "video-kalimat-h", "wide"],
            ].map(([column, route, shape]) => {
              if (!c[column]) return null;
              const m = parse(c[column]);
              return (
                <figure key={column} className="stack-sm">
                  <video
                    className={"reels-player " + shape}
                    controls
                    preload="metadata"
                    src={`/api/${route}/${c.id}/${m.file}?v=${m.renderedAt}`}
                  />
                  <figcaption className="muted small">
                    {m.width}×{m.height} · {Math.round(m.duration)} dtk
                  </figcaption>
                </figure>
              );
            })}
          </section>
        ))}
      </div>
    ) : (
      <section className="card pad">
        <div className="empty">
          Belum ada video buku. Jalankan ▶ Video di halaman Produksi setelah
          gambar dan audio per kalimat siap.
        </div>
      </section>
    );
    content = (
      <div className="stack-lg">
        {content}
        <NewsFinishedContent kind="VIDEO" />
      </div>
    );
  } else if (page === "Stok Gambar") {
    sub = "Kolam stok gambar per lajur.";
    content = <StockGallery />;
  } else {
    // Produksi: halaman utama.
    const books = new Set(rows.map((r) => bookKey(r.book))).size;
    heading = page;
    sub = `${rows.length} bagian dari ${books} buku.`;
    content = queueCard;
  }

  const nextChapter = rows.find((c) => !c.article);
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav aria-label="Navigasi utama">
          {navGroups.map(([group, items]) => (
            <div key={group} className="nav-group">
              <div className="nav-label">{group}</div>
              {items.map(([n, icon]) => (
                <button
                  key={n}
                  className={"nav-btn" + (page === n && !detail ? " on" : "")}
                  aria-label={
                    [
                      "Produksi Berita",
                      "Pengaturan Berita",
                      "Cronjob Berita",
                    ].includes(n)
                      ? n
                      : undefined
                  }
                  aria-current={page === n && !detail ? "page" : undefined}
                  onClick={() => go(n)}
                >
                  <Icon name={icon} />
                  {n === "Produksi Berita"
                    ? "Produksi"
                    : n === "Pengaturan Berita"
                      ? "Pengaturan Konten"
                      : n === "Cronjob Berita"
                        ? "Cronjob"
                        : n}
                  {n === "Produksi" && (
                    <span className="mono nav-count">{rows.length}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="dot-line">
            <span
              className={"dot " + (activeJobs.length ? "dot-run" : "dot-ok")}
            ></span>
            {activeJobs.length
              ? `${activeJobs.length} job berjalan`
              : "Tidak ada job aktif"}
          </div>
          <small className="muted">
            Instagram{" "}
            {instagram.state === "connected"
              ? `${instagram.accounts?.length ?? 0} akun`
              : "belum terhubung"}{" "}
            via NC-WA
          </small>
          {user && <small className="muted">Masuk sebagai {user}</small>}
          <button
            className="btn btn-sec btn-sm"
            onClick={() =>
              action(async () => {
                await api("/logout", "POST");
                setUser("");
                setAuth(false);
              })
            }
          >
            Keluar
          </button>
        </div>
      </aside>
      <main className="main">
        {!detail && (
          <header className="page-head">
            <div>
              <h1>{heading}</h1>
              {sub && <p className="muted">{sub}</p>}
            </div>
            <div className="row-gap">
              <span className="chip t-none chip-lg">
                <Icon name="link" />
                ncpost.nuscode.id
              </span>
              {page === "Produksi" && nextChapter && (
                <button
                  className="btn btn-pri"
                  onClick={() => action(() => open(nextChapter))}
                >
                  <Icon name="plus" />
                  Buka bagian berikutnya
                </button>
              )}
            </div>
          </header>
        )}
        {msg && (
          <div className="alert" role="status">
            <span>{msg}</span>
            <button
              className="btn btn-ghost btn-sm"
              aria-label="Tutup pesan"
              onClick={() => setMsg("")}
            >
              ×
            </button>
          </div>
        )}
        {content}
        {!detail && page === "Produksi" && jobsCard}
        {viewing && (
          <ArticleModal c={viewing} onClose={() => setViewing(null)} />
        )}
        {viewingStock && (
          <StockModal
            c={viewingStock}
            kinds={settingsFor(viewingStock.book).stockKinds}
            onClose={() => setViewingStock(null)}
            onCreate={(kind, name) => {
              const c = viewingStock;
              setViewingStock(null);
              runStage(c, [kind], "Stok " + name);
            }}
          />
        )}
        {viewingSentence && (
          <StockModal
            c={viewingSentence}
            kinds={settingsFor(viewingSentence.book).sentenceKinds}
            sentences={articleSentences(viewingSentence.article).map(
              (s) => s.text,
            )}
            onClose={() => setViewingSentence(null)}
            onCreate={(kind, name) => {
              const c = viewingSentence;
              setViewingSentence(null);
              runStage(c, [kind], "Gambar kalimat " + name);
            }}
          />
        )}
        {viewingPanel && (
          <PanelModal c={viewingPanel} onClose={() => setViewingPanel(null)} />
        )}
        {listeningSentence && (
          <Modal
            c={listeningSentence}
            title="Audio per kalimat"
            onClose={() => setListeningSentence(null)}
            wide
          >
            {(() => {
              const m = parse(listeningSentence.sentence_audio);
              return (
                <ol className="audio-list">
                  {m.sentences.map((x: any) => (
                    <li key={x.file}>
                      <b>Kalimat {x.sentence}</b>
                      <audio
                        controls
                        preload="none"
                        src={`/api/audio-kalimat/${listeningSentence.id}/${x.file}?v=${m.renderedAt}`}
                      />
                      <p className="muted small">{x.narration_text}</p>
                    </li>
                  ))}
                </ol>
              );
            })()}
          </Modal>
        )}
        {watching && (
          <Modal
            c={watching.c}
            title={
              watching.horizontal ? "Video horizontal (16:9)" : "Video (9:16)"
            }
            onClose={() => setWatching(null)}
            wide
          >
            {(() => {
              const m = parse(
                watching.horizontal
                  ? watching.c.sentence_video_h
                  : watching.c.sentence_video,
              );
              const base = `/api/${watching.horizontal ? "video-kalimat-h" : "video-kalimat"}/${watching.c.id}`;
              return (
                <div className="stack">
                  <video
                    className={
                      "reels-player " + (watching.horizontal ? "wide" : "tall")
                    }
                    controls
                    autoPlay
                    src={`${base}/${m.file}?v=${m.renderedAt}`}
                  />
                  <p className="muted small">
                    {Math.round(m.duration)} dtk · {m.frames} frame · {m.fps}{" "}
                    fps · {m.width}×{m.height} · cek integritas{" "}
                    {m.integrity_check}
                  </p>
                </div>
              );
            })()}
          </Modal>
        )}
        {viewingQuoteImage && (
          <Modal
            c={viewingQuoteImage}
            title="Gambar quote"
            onClose={() => setViewingQuoteImage(null)}
            wide
          >
            {(() => {
              const m = parse(viewingQuoteImage.quote_image);
              const src = `/api/quote-image/${viewingQuoteImage.id}?v=${m.renderedAt}`;
              return (
                <figure className="quote-image">
                  <a href={src} target="_blank" rel="noreferrer">
                    <img src={src} alt={viewingQuoteImage.quote ?? ""} />
                  </a>
                  <figcaption className="muted small">
                    {QUOTE_IMAGE_STYLES[m.style]?.label ?? m.style}
                  </figcaption>
                </figure>
              );
            })()}
          </Modal>
        )}
        {viewingQuote && (
          <Modal
            c={viewingQuote}
            title="Quote"
            onClose={() => setViewingQuote(null)}
          >
            <blockquote className="quote">{viewingQuote.quote}</blockquote>
          </Modal>
        )}
        {postingReels && (
          <ReelsModal
            c={postingReels}
            target={instagramTarget(postingReels.book)}
            onClose={() => setPostingReels(null)}
            onConfirm={() => {
              const c = postingReels;
              setPostingReels(null);
              runStage(c, ["REELS_IG"], "Reels IG");
            }}
          />
        )}
        {posting && (
          <PostModal
            c={posting}
            target={instagramTarget(posting.book)}
            onClose={() => setPosting(null)}
            onConfirm={() => {
              const c = posting;
              setPosting(null);
              runStage(c, ["POST_IG"], "Post IG");
            }}
          />
        )}
        <footer className="muted small">
          NC Post Buku · Jadwal otomatis di halaman Cronjob · Preview bukan
          hasil produksi final
        </footer>
      </main>
    </div>
  );
}

function DetailView(p: any) {
  const {
    detail,
    text,
    setText,
    v,
    report,
    preview,
    steps,
    primary,
    running,
    ttsLive,
    visualOk,
    settings,
  } = p;
  const [tab, setTab] = useState<"draft" | "review">("draft");
  const [panel, setPanel] = useState(0);
  const files: string[] = preview?.files ?? [];
  // Panel hasil render (dengan stok) diutamakan; preview template sebagai cadangan.
  const rendered = parse(detail.panels);
  // Panel siap dirender bila setiap sumber panel buku ini punya stok lengkap.
  const lacking = panelSources(p.bookSettings as BookSettings).filter(
    (k) =>
      (detail.stock ?? []).filter((x: any) => x.kind === k).length <
      PANEL_COUNT,
  );
  const thumbs = rendered
    ? [
        ...rendered.panels.map((x: any, i: number) => ({
          label: String(i + 1),
          src: `/api/panels/${detail.id}/${x.file}?v=${rendered.renderedAt}`,
          alt: `Panel ${i + 1} · template ${x.template}`,
        })),
        {
          label: "CTA",
          src: `/api/panels/${detail.id}/${rendered.closing}?v=${rendered.renderedAt}`,
          alt: "Slide penutup",
        },
      ]
    : [
        ...files.map((f, i) => ({
          label: String(i + 1),
          src: "/api/media/" + f.replace("work/", ""),
          alt: `Preview panel ${i + 1}`,
        })),
        ...(files.length
          ? [{ label: "CTA", src: "/api/cta", alt: "CTA asli" }]
          : []),
      ];
  const current = thumbs[Math.min(panel, thumbs.length - 1)];
  return (
    <div className="stack-lg">
      <header className="page-head">
        <div>
          <nav aria-label="Breadcrumb" className="crumbs">
            <button className="link" onClick={p.onBack}>
              Antrean
            </button>
            <span>/</span>
            <span>{detail.book}</span>
            <span>/</span>
            <span className="ink">
              Bagian {String(p.part).padStart(2, "0")}
            </span>
          </nav>
          <h1>{detail.title}</h1>
          <p className="muted">
            Revisi {detail.revision}
            {report
              ? ` · laporan editor ${report.lolos ? "lolos" : "minta revisi"}`
              : ""}
            {running.length
              ? ` · ${running.length} job aktif untuk bagian ini`
              : ""}
          </p>
        </div>
        <div className="row-gap">
          <button className="btn btn-sec" onClick={p.onBack}>
            ← Kembali ke antrean
          </button>
          <button className="btn btn-sec" onClick={p.onEditPart}>
            Ubah nomor
          </button>
          <button className="btn btn-sec btn-danger" onClick={p.onDelete}>
            Hapus bagian
          </button>
        </div>
      </header>

      <section className="card steps" aria-label="Tahapan produksi">
        {steps.map((s: any, i: number) => (
          <div key={s.name} className={"step t-" + s.s.tone}>
            <span className="step-dot">{s.s.tone === "ok" ? "✓" : i + 1}</span>
            <div>
              <b>{s.name}</b>
              <small>{s.s.label}</small>
            </div>
          </div>
        ))}
      </section>

      <div className="detail-grid">
        <section className="card pad stack">
          <div className="card-title">
            <h2 className="h3">Artikel</h2>
            <div className="tabs" role="tablist">
              <button
                role="tab"
                aria-selected={tab === "draft"}
                className={tab === "draft" ? "on" : ""}
                onClick={() => setTab("draft")}
              >
                Draf
              </button>
              <button
                role="tab"
                aria-selected={tab === "review"}
                className={tab === "review" ? "on" : ""}
                onClick={() => setTab("review")}
              >
                Laporan editor
              </button>
            </div>
          </div>
          {tab === "draft" ? (
            <>
              <label className="field">
                Artikel (hook + lima paragraf)
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={18}
                  placeholder="Belum ada artikel. Buat dengan Codex atau tulis manual."
                />
              </label>
              <div className="stack-sm">
                <div className="field-row small">
                  <b>Struktur</b>
                  <Chip
                    s={
                      v.ok
                        ? { tone: "ok", label: "Lolos lint" }
                        : { tone: "act", label: "Belum memenuhi kontrak" }
                    }
                  />
                </div>
                {(v.errors ?? []).map((e: string) => (
                  <p className="error" key={e}>
                    {e}
                  </p>
                ))}
              </div>
              <div className="row-gap divider">
                <button className="btn btn-sec" onClick={p.onSave}>
                  Simpan draf
                </button>
                <button
                  className="btn btn-sec"
                  disabled={!v.ok}
                  onClick={() => p.onEnqueue("EDITOR")}
                >
                  Review editor
                </button>
                {detail.article ? (
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Ganti artikel tersimpan dan batalkan seluruh hasil turunannya?",
                        )
                      )
                        p.onEnqueue("ARTICLE", true);
                    }}
                  >
                    Regenerasi artikel
                  </button>
                ) : (
                  <button
                    className="btn btn-sec"
                    onClick={() => p.onEnqueue("ARTICLE")}
                  >
                    Generate artikel
                  </button>
                )}
              </div>
              <small className="muted">
                Menyimpan draf membuat revisi baru dan membatalkan job aktif
                serta hasil turunan.
              </small>
            </>
          ) : report ? (
            <>
              <div className={"banner t-" + (report.lolos ? "ok" : "act")}>
                <Chip
                  s={
                    report.lolos
                      ? { tone: "ok", label: "Lolos" }
                      : { tone: "act", label: "Perlu revisi" }
                  }
                />
                <span>
                  {
                    report.checks.filter((c: any) => c.status === "lulus")
                      .length
                  }{" "}
                  dari {report.checks.length} pemeriksaan lulus ·{" "}
                  {report.provider}
                  {report.applied ? " · review sudah diterapkan" : ""}
                  {report.formatFixed ? " · format diperbaiki" : ""}
                </span>
              </div>
              <ul className="checks">
                {report.checks.map((c: any) => (
                  <li key={c.id}>
                    <div className="field-row">
                      <b>{checkName(c.id)}</b>
                      <Chip
                        s={
                          c.status === "lulus"
                            ? { tone: "ok", label: "Lulus" }
                            : { tone: "act", label: "Revisi" }
                        }
                      />
                    </div>
                    <p>{c.catatan}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="empty">
              Belum ada review makna. Artikel belum dinyatakan siap editorial.
            </div>
          )}
        </section>

        <section className="card pad stack">
          <div className="card-title">
            <h2 className="h3">Panel</h2>
            <Chip
              s={
                rendered
                  ? { tone: "ok", label: "Siap dipublikasikan" }
                  : { tone: "act", label: "Template saja" }
              }
            />
          </div>
          <div className="field-row small muted">
            <span className="mono">
              1080 × 1350 · {rendered ? rendered.footer : "Template 1"}
            </span>
            {current && (
              <span className="mono">
                {current.label === "CTA"
                  ? "CTA"
                  : `Panel ${current.label} / ${PANEL_COUNT}`}
              </span>
            )}
          </div>
          {current ? (
            <>
              <figure className="preview">
                <img src={current.src} alt={current.alt} />
              </figure>
              <div className="thumbs">
                {thumbs.map((t, i) => (
                  <button
                    key={t.label}
                    className={"thumb" + (t === current ? " on" : "")}
                    aria-label={"Tampilkan " + t.alt}
                    onClick={() => setPanel(i)}
                  >
                    <img src={t.src} alt="" />
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="preview empty-preview">
              <Icon name="image" size={32} />
              <span>Panel belum dirender</span>
            </div>
          )}
          <button
            className="btn btn-pri"
            disabled={detail.article_status !== "siap" || lacking.length > 0}
            title={
              lacking.length
                ? "Butuh lima stok: " + lacking.map(laneName).join(", ")
                : ""
            }
            onClick={() => p.onEnqueue("PANEL")}
          >
            {rendered ? "Render ulang panel" : "Render panel"}
          </button>
          {!rendered && (
            <button
              className="btn btn-sec"
              disabled={!v.ok}
              onClick={() => p.onEnqueue("PREVIEW")}
            >
              Render preview
            </button>
          )}
          <small className="muted">
            {rendered
              ? "Lima panel dengan stok gambar + slide penutup, siap dipublikasikan sebagai postingan gambar."
              : "Preview memakai template asli tanpa stok foto; render panel memakai stok gambar bagian ini."}
          </small>
        </section>

        <aside className="stack-lg">
          <section className="card pad stack">
            <div className="card-title">
              <h2 className="h3">Stok gambar</h2>
              <Chip s={status(detail.visual_status)} />
            </div>
            {IMAGE_LANES.map(([k, name, size]) => (
              <div key={k} className="field-row">
                <div>
                  <b>{name}</b>
                  <small className="block muted">
                    {size} ·{" "}
                    {
                      (detail.stock ?? []).filter((x: any) => x.kind === k)
                        .length
                    }
                    /{PANEL_COUNT} terikat
                  </small>
                </div>
                <button
                  className="btn btn-sec btn-sm"
                  disabled={detail.article_status !== "siap"}
                  title={
                    detail.article_status !== "siap"
                      ? "Memerlukan artikel lolos editor"
                      : ""
                  }
                  onClick={() => p.onEnqueue(k)}
                >
                  Buat
                </button>
              </div>
            ))}
            {detail.article_status !== "siap" && (
              <small className="muted">Memerlukan artikel lolos editor.</small>
            )}
          </section>
          <section className="card pad stack">
            <div className="card-title">
              <h2 className="h3">Instagram Reels</h2>
              <Chip
                s={
                  detail.reels_status !== "belum"
                    ? status(detail.reels_status)
                    : detail.sentence_video
                      ? { tone: "act", label: "Siap diposting" }
                      : { tone: "none", label: "Menunggu video" }
                }
              />
            </div>
            <div className="dot-line small">
              <span
                className={
                  "dot " +
                  (settings?.ncwa?.state === "connected" ? "dot-ok" : "dot-off")
                }
              ></span>
              {settings?.ncwa?.state === "connected"
                ? (settings.ncwa.accounts ?? [])
                    .map((a: any) => "@" + a.username)
                    .join(", ") + " via NC-WA"
                : "NC-WA belum terhubung"}
            </div>
          </section>
        </aside>
      </div>

      <div className="nextbar" role="region" aria-label="Langkah berikutnya">
        <div>
          <b>
            Langkah berikutnya:{" "}
            {primary.label ? primary.label.toLowerCase() : "menunggu penyedia"}
          </b>
          <small>{primary.hint}</small>
        </div>
        {primary.run && (
          <button className="btn btn-inv" onClick={primary.run}>
            {primary.label}
          </button>
        )}
      </div>
    </div>
  );
}

function ProviderList({ rows }: { rows: any[] }) {
  return (
    <ul className="providers">
      {rows.map((r) => (
        <li key={r.name}>
          <div>
            <b>{r.name}</b>
            <small>{r.note}</small>
          </div>
          <Chip s={r.s} />
        </li>
      ))}
    </ul>
  );
}

function Chip({ s }: { s: { tone: Tone; label: string } }) {
  return (
    <span className={"chip t-" + s.tone}>
      <i aria-hidden="true"></i>
      {s.label}
    </span>
  );
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">NC</span>
      <div>
        <b>NC Post</b>
        <small>Studio Buku</small>
      </div>
    </div>
  );
}

const checkNames: Record<string, string> = {
  "kesetiaan-gagasan": "Kesetiaan gagasan",
  "klaim-spesifik": "Klaim spesifik",
  "bahasa-natural": "Bahasa natural",
  "judul-konkret": "Judul konkret",
  "nilai-penutup": "Nilai penutup",
  "istilah-asli": "Istilah asli",
  struktur: "Struktur artikel",
};
const checkName = (id: string) => checkNames[id] ?? id;
const jobLabels: Record<string, string> = {
  ARTICLE: "Artikel",
  EDITOR: "Review editor",
  PREVIEW: "Preview",
  IMAGE_HORIZONTAL: "Stok horizontal",
  IMAGE_VERTICAL: "Stok vertikal",
  IMAGE_MINIMALIST: "Stok minimalist",
  IMAGE_PAPERCUT: "Stok paper cut vertikal",
  IMAGE_PAPERCUT_HORIZONTAL: "Stok paper cut horizontal",
  PANEL: "Render panel",
  POST_IG: "Post IG",
  REELS_IG: "Reels IG",
  TTS_KALIMAT: "Audio",
  VIDEO_KALIMAT: "Video",
  VIDEO_KALIMAT_H: "Video H",
  QUOTE: "Quote",
  QUOTE_IMAGE: "Gambar quote",
};
const jobLabel = (k: string) => jobLabels[k] ?? k;

type IconName =
  | "grid"
  | "book"
  | "doc"
  | "image"
  | "wave"
  | "video"
  | "send"
  | "key"
  | "gear"
  | "search"
  | "link"
  | "plus"
  | "play"
  | "check"
  | "redo"
  | "eye"
  | "edit"
  | "trash"
  | "sliders";
const paths: Record<IconName, React.ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  book: (
    <>
      <path d="M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2z" />
      <path d="M22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z" />
    </>
  ),
  doc: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
    </>
  ),
  wave: <path d="M2 10v4M6 6v12M10 3v18M14 8v8M18 5v14M22 10v4" />,
  video: (
    <>
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="m22 8-6 4 6 4z" />
    </>
  ),
  send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />,
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m10.8 12.2 9.2-9.2M17 6l3 3M15 8l2 2" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  link: (
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  play: <path d="M8 5v14l11-7z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  redo: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  sliders: (
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4" />
  ),
  edit: <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
};
function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
type PlayProps = {
  title: string;
  run?: () => void;
  busy?: boolean;
  done?: boolean;
  redo?: () => void;
  view?: () => void;
  viewTitle?: string;
};
function CronSettings({
  items,
  onSave,
}: {
  items: BookCron[];
  onSave: (cron: BookCron) => Promise<void>;
}) {
  const books = [...new Set(items.map((c) => c.book))];
  return (
    <div className="stack-lg">
      <section className="card pad stack-sm">
        <b>Cronjob per buku</b>
        <p>
          Setiap jadwal memproses satu bagian berikutnya yang belum selesai dan
          memenuhi prasyarat. Gambar Panel/Video mengikuti lajur di Pengaturan
          Konten.
        </p>
        <p className="muted">
          Pilih setiap berapa jam masing-masing jenis konten diproses, misalnya
          2, 6, atau 24 jam. Jadwal pertama berjalan setelah interval sejak
          disimpan. Worker harus berjalan; jadwal yang terlewat dijalankan
          sekali saat worker kembali aktif.
        </p>
        <p className="muted">
          Aktifkan Post IG atau Reels IG untuk menerbitkan otomatis saat panel
          atau video siap. Hasil yang sudah terbit atau statusnya belum pasti
          tidak dikirim ulang.
        </p>
      </section>
      {!books.length && (
        <section className="card pad">
          Belum ada buku. Tambahkan bagian di halaman Produksi.
        </section>
      )}
      {books.map((book) => (
        <section key={book} className="card pad stack">
          <h2 className="h3">{book}</h2>
          <div className="table">
            <table className="cron-table">
              <thead>
                <tr>
                  {CRON_TYPES.map(([kind, label]) => (
                    <th key={kind}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {CRON_TYPES.map(([kind, label]) => (
                    <td key={kind}>
                      <CronCell
                        cron={
                          items.find((c) => c.book === book && c.kind === kind)!
                        }
                        label={label}
                        onSave={onSave}
                      />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
function CronCell({
  cron,
  label,
  onSave,
}: {
  cron: BookCron;
  label: string;
  onSave: (c: BookCron) => Promise<void>;
}) {
  const [draft, setDraft] = useState(cron);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(
    () => setDraft(cron),
    [cron.book, cron.kind, cron.enabled, cron.intervalHours],
  );
  const invalid = validIntervalHours(draft.intervalHours)
    ? ""
    : `Isi angka bulat 1–${MAX_INTERVAL_HOURS} jam`;
  const changed =
    draft.enabled !== cron.enabled ||
    draft.intervalHours !== cron.intervalHours;
  return (
    <div className="stack-sm">
      <label className="check-row">
        <input
          type="checkbox"
          checked={draft.enabled}
          disabled={saving}
          aria-label={`Aktifkan ${label} ${cron.book}`}
          onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
        />{" "}
        Aktif
      </label>
      <label className="field">
        Setiap berapa jam
        <input
          type="number"
          min={1}
          max={MAX_INTERVAL_HOURS}
          step={1}
          aria-label={`Interval jam ${label} ${cron.book}`}
          value={Number.isNaN(draft.intervalHours) ? "" : draft.intervalHours}
          disabled={saving}
          onChange={(e) =>
            setDraft({ ...draft, intervalHours: e.target.valueAsNumber })
          }
        />
      </label>
      {(invalid || error) && (
        <small role="alert" className="warn">
          {invalid || error}
        </small>
      )}
      <button
        className="btn btn-sec btn-sm"
        disabled={!changed || !!invalid || saving}
        onClick={async () => {
          setSaving(true);
          setError("");
          try {
            await onSave(draft);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? "Menyimpan…" : "Simpan"}
      </button>
      <small className="muted">
        {cron.last_tick == null
          ? "Belum dijalankan"
          : new Date(cron.last_tick).toLocaleString("id-ID", {
              timeZone: "Asia/Jakarta",
            }) + " WIB"}
      </small>
      {cron.enabled && cron.next_run != null && (
        <small className="muted">
          Berikutnya:{" "}
          {new Date(cron.next_run).toLocaleString("id-ID", {
            timeZone: "Asia/Jakarta",
          })}{" "}
          WIB
        </small>
      )}
      {cron.last_result && <small className="muted">{cron.last_result}</small>}
    </div>
  );
}

// Pengaturan Konten: satu kartu per judul buku dengan draf lokal sampai disimpan.
function NewsProduction({
  instagram,
  ttsReady,
  ttsReason,
}: {
  instagram: InstagramConnection;
  ttsReady: boolean;
  ttsReason: string;
}) {
  const [mediaView, setMediaView] = useState<{
    id: number;
    stage: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [items, setItems] = useState<NewsArticle[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setItems(await api("/news"));
    setError("");
  };
  useEffect(() => {
    let mounted = true;
    const poll = () =>
      api("/news")
        .then((r) => {
          if (mounted) {
            setItems(r);
            setError("");
          }
        })
        .catch((e) => {
          if (mounted) setError(e.message);
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    poll();
    const timer = setInterval(poll, 3000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const current = items.find((n) => n.id === selected);
  const candidates = current ? parse(current.candidates) : null;
  const artifacts = current ? parse(current.artifacts) : null;
  const stages = NEWS_MEDIA_STAGES;
  const mediaUrl = (id: number, stage: string, index = 0) =>
    `/api/news/${id}/media/${stage}/${index}`;
  const mediaCurrent = items.find((n) => n.id === mediaView?.id);
  const runMedia = (n: NewsArticle, stage: string, replace = false) =>
    run(async () => {
      if (["POST_IG", "REELS_IG"].includes(stage)) {
        const account = selectInstagramAccount(
          n.settings?.instagramAccountId ?? null,
          instagram,
        );
        if (
          !confirm(
            `Kirim ${stage === "POST_IG" ? "carousel panel" : "Reels video"} berita "${n.title}" ke @${account.username}?`,
          )
        )
          return;
      } else if (
        replace &&
        !confirm(
          `Buat ulang ${stages.find(([k]) => k === stage)?.[1]} untuk berita "${n.title}"?`,
        )
      )
        return;
      await api(`/news/${n.id}/jobs`, "POST", { kind: stage, replace });
    });
  const mediaPlay = (n: NewsArticle, stage: string): PlayProps => {
    const p = n.production ?? emptyNewsProduction();
    const settings = n.settings ?? DEFAULT_BOOK_SETTINGS;
    const kinds = newsKinds(stage, settings);
    const active = p.jobs.some(
      (j) => kinds.includes(j.kind) && ["queued", "running"].includes(j.state),
    );
    const publication = ["POST_IG", "REELS_IG"].includes(stage);
    const output = p.outputs[stage];
    const sent = publication && output && output.status !== "failed";
    const done = newsStageDone(stage, p, settings, n.article);
    const reason =
      n.state !== "completed"
        ? "Butuh artikel selesai"
        : !kinds.length
          ? "Pilih jenis gambar di Pengaturan Konten"
          : stage === "TTS_KALIMAT" && !ttsReady
            ? ttsReason
            : kinds
                .map((k) => newsPrerequisite(k, p, settings, n.article))
                .find(Boolean);
    const hasView =
      stage === "IMAGES_PANEL" || stage === "IMAGES_VIDEO"
        ? p.stock.some((b) => kinds.includes(b.kind))
        : !!output;
    return {
      title: active
        ? "Sedang diproses"
        : sent && !done
          ? `Status Instagram: ${output.status}`
          : reason ||
            `${done ? "Selesai" : "Buat"} ${stages.find(([k]) => k === stage)?.[1]}`,
      busy:
        active ||
        (sent &&
          ["processing", "preparing", "publishing"].includes(output.status)),
      done,
      run:
        !busy && !active && !sent && !reason
          ? () => runMedia(n, stage)
          : undefined,
      redo:
        done &&
        !publication &&
        !busy &&
        !p.jobs.some((j) => ["queued", "running"].includes(j.state))
          ? () => runMedia(n, stage, true)
          : undefined,
      view: hasView ? () => setMediaView({ id: n.id, stage }) : undefined,
      viewTitle: `Lihat ${stages.find(([k]) => k === stage)?.[1]} berita #${n.id}`,
    };
  };
  const visible = items.filter(
    (n) =>
      (!category || n.category === category) &&
      `${n.title} ${n.category} ${n.id}`
        .toLocaleLowerCase("id")
        .includes(search.toLocaleLowerCase("id")),
  );
  const articlePlay = (n: NewsArticle): PlayProps => ({
    title:
      n.state === "completed"
        ? "Artikel selesai"
        : n.state === "failed"
          ? "Coba ulang artikel"
          : "Artikel sedang diproses",
    done: n.state === "completed",
    busy: n.state === "queued" || n.state === "running",
    run:
      n.state === "failed" && !busy
        ? () => run(() => api(`/news/${n.id}/retry`, "POST"))
        : undefined,
    redo:
      n.state === "completed" && !busy
        ? () => {
            if (
              confirm(
                `Buat ulang artikel "${n.title}"? Hasil lama diganti setelah artikel baru selesai.`,
              )
            )
              run(() => api(`/news/${n.id}/regenerate`, "POST"));
          }
        : undefined,
    view: n.article ? () => setSelected(n.id) : undefined,
    viewTitle: `Lihat artikel berita #${n.id}`,
  });
  return (
    <div className="stack-lg">
      <section className="card queue">
        <div className="card-head">
          <h2>Antrean berita</h2>
          <div className="toolbar">
            <div className="search">
              <Icon name="search" />
              <input
                aria-label="Cari artikel berita"
                placeholder="Cari artikel berita"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="book-filter"
              aria-label="Filter jenis berita"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Semua jenis berita</option>
              <option value="teknologi">Teknologi</option>
            </select>
          </div>
        </div>
        <div className="add-chapter">
          <label className="field">
            Jenis berita
            <select aria-label="Jenis berita baru" value="teknologi" disabled>
              <option value="teknologi">Teknologi</option>
            </select>
          </label>
          <button
            className="btn btn-pri"
            disabled={busy || loading}
            onClick={() => run(() => api("/news", "POST"))}
          >
            <Icon name="plus" />
            {busy ? "Memproses…" : "Buat artikel"}
          </button>
        </div>
        {error && (
          <p role="alert" className="warn">
            {error}
          </p>
        )}
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>Jenis Berita</th>
                <th>Artikel</th>
                {stages.map(([key, stage]) => (
                  <th key={key}>{stage}</th>
                ))}
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((n) => (
                <tr key={n.id} className="row">
                  <td className="title-cell">
                    <span className="mono num">
                      {String(n.id).padStart(2, "0")}
                    </span>
                    <div>
                      <b>Teknologi</b>
                      <small className="block muted">
                        {n.title || `Artikel berita #${n.id}`}
                      </small>
                      {n.error && (
                        <small className="block warn">{n.error}</small>
                      )}
                      {n.production?.jobs.find((j) => j.state === "failed")
                        ?.error && (
                        <small className="block warn">
                          {
                            n.production.jobs.find((j) => j.state === "failed")
                              ?.error
                          }
                        </small>
                      )}
                    </div>
                  </td>
                  <td>
                    <StageCell play={articlePlay(n)} />
                  </td>
                  {stages.map(([stage]) => (
                    <td key={stage}>
                      <StageCell play={mediaPlay(n, stage)} />
                      {["POST_IG", "REELS_IG"].includes(stage) &&
                        n.production?.outputs[stage] && (
                          <small className="block muted">
                            {n.production.outputs[stage].status}
                          </small>
                        )}
                    </td>
                  ))}
                  <td>
                    <Chip s={status(n.state)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && (
            <div className="empty">
              {loading
                ? "Memuat…"
                : items.length
                  ? "Tidak ada berita yang cocok dengan filter."
                  : "Belum ada artikel berita. Klik Buat artikel untuk memulai."}
            </div>
          )}
        </div>
      </section>
      {mediaCurrent && mediaView && (
        <Modal
          c={mediaCurrent}
          title={`${stages.find(([k]) => k === mediaView.stage)?.[1]} · ${mediaCurrent.title}`}
          subtitle="Teknologi"
          wide
          onClose={() => setMediaView(null)}
        >
          {["POST_IG", "REELS_IG"].includes(mediaView.stage) ? (
            <div className="stack">
              <p>
                Akun: @
                {mediaCurrent.production?.outputs[mediaView.stage]?.username}
              </p>
              <p>
                Status:{" "}
                {mediaCurrent.production?.outputs[mediaView.stage]?.status}
              </p>
              <p className="mono">
                Request:{" "}
                {mediaCurrent.production?.outputs[mediaView.stage]?.requestId}
              </p>
              <button
                className="btn btn-sec"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    api(
                      `/news/${mediaCurrent.id}/publications/${mediaView.stage}/refresh`,
                      "POST",
                    ),
                  )
                }
              >
                Periksa status Instagram
              </button>
            </div>
          ) : mediaView.stage === "IMAGES_PANEL" ||
            mediaView.stage === "IMAGES_VIDEO" ? (
            <NewsStockView
              key={`${mediaCurrent.id}-${mediaView.stage}`}
              article={mediaCurrent}
              stage={mediaView.stage}
              busy={busy}
              error={error}
              onCreate={(kind) => runMedia(mediaCurrent, kind)}
            />
          ) : mediaView.stage === "PANEL" ? (
            <div className="gallery">
              {Array.from({ length: 5 }, (_, i) => (
                <a
                  key={i}
                  href={mediaUrl(mediaCurrent.id, "PANEL", i)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    src={mediaUrl(mediaCurrent.id, "PANEL", i)}
                    alt={i === 4 ? "Slide penutup" : `Panel berita ${i + 1}`}
                  />
                </a>
              ))}
            </div>
          ) : mediaView.stage === "TTS_KALIMAT" ? (
            <div className="stack">
              <p className="muted">
                Audio:{" "}
                {mediaCurrent.production?.outputs.TTS_KALIMAT?.provider ===
                "edge-tts"
                  ? `Edge TTS · ${mediaCurrent.production.outputs.TTS_KALIMAT.voice}`
                  : "ElevenLabs (hasil sebelumnya)"}
              </p>
              {(
                mediaCurrent.production?.outputs.TTS_KALIMAT?.sentences ?? []
              ).map((x: any, i: number) => (
                <div key={i}>
                  <p>{x.narration_text}</p>
                  <audio
                    controls
                    preload="none"
                    src={mediaUrl(mediaCurrent.id, "TTS_KALIMAT", i)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <NewsVideoView
              article={mediaCurrent}
              stage={mediaView.stage}
              onSelect={(stage) => setMediaView({ id: mediaCurrent.id, stage })}
            />
          )}
        </Modal>
      )}
      {current && (
        <Modal
          c={current}
          title={current.title || `Artikel berita #${current.id}`}
          subtitle="Teknologi"
          onClose={() => setSelected(null)}
        >
          <div className="card-title">
            <div className="row-gap">
              <a
                className="btn btn-sec btn-sm"
                download={`berita-${current.id}.md`}
                href={`data:text/markdown;charset=utf-8,${encodeURIComponent(current.article)}`}
              >
                Download artikel
              </a>
            </div>
          </div>
          <article className="news-article">
            {current.article.split(/\n\s*\n/).map((block, i) => {
              if (
                block.startsWith("# ") ||
                block.trim() === current.title ||
                block.startsWith("Sumber:") ||
                /^1\. \[/.test(block)
              )
                return null;
              const section = /^## ([^\n]+)(?:\n+([\s\S]*))?$/.exec(block);
              return section ? (
                <React.Fragment key={i}>
                  <h3>{section[1]}</h3>
                  {section[2] && <p>{section[2]}</p>}
                </React.Fragment>
              ) : (
                <p key={i}>{block}</p>
              );
            })}
          </article>
          {current.source_url && (
            <p>
              Sumber:{" "}
              <a
                href={current.source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Buka artikel sumber
              </a>
            </p>
          )}
          {Array.isArray(candidates) && (
            <details>
              <summary>Tiga kandidat berita dan alasan pemilihan</summary>
              <div className="stack">
                {candidates.map((c: any) => (
                  <div key={c.url}>
                    <b>{c.original_title}</b> · {c.source}
                    {c.selected && <span className="chip t-ok">Dipilih</span>}
                    <p>{c.summary}</p>
                    {c.selected && <p>{c.reason}</p>}
                    <a href={c.url} target="_blank" rel="noopener noreferrer">
                      Buka sumber
                    </a>
                  </div>
                ))}
              </div>
            </details>
          )}
          {artifacts && (
            <details>
              <summary>Hasil validasi artikel dan peta klaim</summary>
              <p className="muted">
                Struktur diperiksa aplikasi. Penilaian isi dan bukti sumber
                mengikuti laporan pembuatan artikel.
              </p>
              <pre className="news-audit">
                {JSON.stringify(
                  {
                    struktur: artifacts.validation,
                    pemeriksaan: artifacts.article_validation,
                    klaim: artifacts.claim_source_map,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          )}
        </Modal>
      )}
    </div>
  );
}

function NewsStockView({
  article,
  stage,
  busy,
  error,
  onCreate,
}: {
  article: NewsArticle;
  stage: string;
  busy: boolean;
  error: string;
  onCreate: (kind: string) => void;
}) {
  const p = article.production ?? emptyNewsProduction();
  const kinds = newsKinds(stage, article.settings ?? DEFAULT_BOOK_SETTINGS);
  const [selected, setSelected] = useState(kinds[0] ?? "");
  const kind = kinds.includes(selected) ? selected : (kinds[0] ?? "");
  const perSentence = stage === "IMAGES_VIDEO";
  const content = newsContent(article.article);
  const expected = perSentence ? content.sentences.length : 4;
  const items = p.stock.filter((x) => x.kind === kind);
  const active = p.jobs.some(
    (j) => j.kind === kind && ["queued", "running"].includes(j.state),
  );
  if (!kinds.length)
    return (
      <p className="muted">Pilih jenis gambar di Pengaturan Konten berita.</p>
    );
  return (
    <div className="stack">
      <div className="seg" role="tablist" aria-label="Jenis gambar berita">
        {kinds.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            className={kind === k ? "on" : ""}
            onClick={() => setSelected(k)}
          >
            {laneName(k.replace(/^S_/, ""))} ·{" "}
            {p.stock.filter((x) => x.kind === k).length}/{expected}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="warn">
          {error}
        </p>
      )}
      {items.length < expected && (
        <div className="row-gap">
          <button
            className="btn btn-pri btn-sm"
            disabled={article.state !== "completed" || busy || active}
            onClick={() => onCreate(kind)}
          >
            <Icon name="play" size={14} />
            {active ? "Sedang diproses…" : "Buat stok lajur ini"}
          </button>
          <small className="muted">
            Hanya lajur ini yang dibuat; lajur lain tetap tersimpan.
          </small>
        </div>
      )}
      {!items.length ? (
        <div className="empty">Belum ada gambar untuk jenis ini.</div>
      ) : (
        <div
          className={`stock-grid${HORIZONTAL_KINDS.includes(kind.replace(/^S_/, "")) ? " wide" : ""}`}
        >
          {items.map((x) => (
            <figure key={x.panel}>
              <a
                href={`/api/stock/${x.asset_id}/image`}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  loading="lazy"
                  src={`/api/stock/${x.asset_id}/image`}
                  alt={x.description}
                />
              </a>
              <figcaption>
                <span className="mono muted">
                  {perSentence ? "Kalimat" : "Panel"} {x.panel}
                </span>
                <span>
                  {perSentence
                    ? (content.sentences[x.panel - 1]?.text ?? x.description)
                    : x.description}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
function NewsVideoView({
  article,
  stage,
  onSelect,
}: {
  article: NewsArticle;
  stage: string;
  onSelect: (stage: string) => void;
}) {
  const outputs = article.production?.outputs ?? {};
  const m = outputs[stage];
  const url = `/api/news/${article.id}/media/${stage}/0?v=${encodeURIComponent(m?.renderedAt ?? "")}`;
  const metrics = [
    Number.isFinite(m?.duration) ? `${Math.round(m.duration)} dtk` : null,
    Number.isFinite(m?.frames) ? `${m.frames} frame` : null,
    Number.isFinite(m?.fps) ? `${m.fps} fps` : null,
    m?.width && m?.height ? `${m.width}×${m.height}` : null,
    m?.integrity_check ? `cek integritas ${m.integrity_check}` : null,
  ].filter(Boolean);
  return (
    <div className="stack">
      <div className="seg" role="tablist" aria-label="Orientasi video berita">
        {[
          ["VIDEO_KALIMAT", "Video V (9:16)"],
          ["VIDEO_KALIMAT_H", "Video H (16:9)"],
        ].map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={stage === k}
            className={stage === k ? "on" : ""}
            disabled={!outputs[k]}
            onClick={() => onSelect(k)}
          >
            {label}
            {!outputs[k] ? " · belum tersedia" : ""}
          </button>
        ))}
      </div>
      {m ? (
        <>
          <video
            key={url}
            className={`reels-player ${stage === "VIDEO_KALIMAT_H" ? "wide" : "tall"}`}
            controls
            preload="metadata"
            src={url}
          />
          {metrics.length > 0 && (
            <p className="muted small">{metrics.join(" · ")}</p>
          )}
          <a
            className="btn btn-sec btn-sm"
            href={url}
            download={`berita-${article.id}-${stage === "VIDEO_KALIMAT_H" ? "video-h" : "video-v"}.mp4`}
          >
            Download video
          </a>
        </>
      ) : (
        <p className="muted">Video belum tersedia.</p>
      )}
    </div>
  );
}

function NewsFinishedContent({ kind }: { kind: "PANEL" | "VIDEO" }) {
  const [rows, setRows] = useState<NewsArticle[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = () =>
      api("/news")
        .then((r) => {
          if (active) {
            setRows(r);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    load();
    const timer = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  const items = rows.filter((n) =>
    kind === "PANEL"
      ? n.production?.outputs.PANEL
      : n.production?.outputs.VIDEO_KALIMAT ||
        n.production?.outputs.VIDEO_KALIMAT_H,
  );
  if (error) return <p className="warn">{error}</p>;
  if (!items.length) return null;
  return (
    <div className="stack-lg">
      {items.map((n) => (
        <section key={n.id} className="card pad stack">
          <div>
            <small className="muted">Berita · Teknologi</small>
            <h2 className="h3">{n.title}</h2>
          </div>
          {kind === "PANEL" ? (
            <div className="gallery">
              {Array.from({ length: 5 }, (_, i) => (
                <a
                  key={i}
                  href={`/api/news/${n.id}/media/PANEL/${i}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    loading="lazy"
                    src={`/api/news/${n.id}/media/PANEL/${i}`}
                    alt={
                      i === 4 ? "Slide penutup berita" : `Panel berita ${i + 1}`
                    }
                  />
                </a>
              ))}
            </div>
          ) : (
            <div className="row-gap">
              {["VIDEO_KALIMAT", "VIDEO_KALIMAT_H"]
                .filter((k) => n.production?.outputs[k])
                .map((k) => (
                  <video
                    key={k}
                    className={`reels-player ${k.endsWith("_H") ? "wide" : "tall"}`}
                    controls
                    preload="metadata"
                    src={`/api/news/${n.id}/media/${k}/0`}
                  />
                ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function NewsCronSettings() {
  const [items, setItems] = useState<BookCron[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    api("/news-crons")
      .then(setItems)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="stack-lg">
      <section className="card pad stack">
        <h2 className="h3">Cronjob berita Teknologi</h2>
        <p>
          Setiap jadwal memproses satu berita berikutnya yang belum selesai dan
          memenuhi prasyarat. Jadwal Artikel mencari berita baru. Gambar
          mengikuti Pengaturan Konten.
        </p>
        <p className="muted">
          Interval dihitung sejak disimpan. Jadwal terlewat berjalan sekali saat
          worker kembali aktif. Aktifkan Post IG atau Reels IG untuk publikasi
          otomatis ke akun yang dipilih; status terbit atau belum pasti tidak
          dikirim ulang.
        </p>
      </section>
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      <section className="card queue">
        <div className="table">
          <table className="cron-table">
            <thead>
              <tr>
                {NEWS_CRON_TYPES.map(([k, label]) => (
                  <th key={k}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {NEWS_CRON_TYPES.map(([k, label]) => (
                  <td key={k}>
                    {items.find((c) => c.kind === k) && (
                      <CronCell
                        label={label}
                        cron={items.find((c) => c.kind === k)!}
                        onSave={async (c) => {
                          setItems(await api("/news-crons", "PUT", c));
                        }}
                      />
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function NewsContentSettings({
  instagram,
  onRefreshInstagram,
}: {
  instagram: InstagramConnection;
  onRefreshInstagram: () => void;
}) {
  const [settings, setSettings] = useState<BookSettings | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    api("/news-settings")
      .then((r) => setSettings(r[0].settings))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="stack">
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {settings ? (
        <BookSettingsCard
          news
          book="Teknologi"
          settings={settings}
          instagram={instagram}
          onRefreshInstagram={onRefreshInstagram}
          onSave={async (_, draft) => {
            try {
              const r = await api("/news-settings", "PUT", {
                category: "teknologi",
                settings: draft,
              });
              setSettings(r.settings);
              setError("");
              setMessage("Pengaturan berita tersimpan");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        />
      ) : (
        <p>Memuat pengaturan berita…</p>
      )}
    </div>
  );
}

function ContentSettings({
  items,
  instagram,
  onRefreshInstagram,
  onSave,
}: {
  items: { book: string; settings: BookSettings }[];
  instagram: InstagramConnection;
  onRefreshInstagram: () => void;
  onSave: (book: string, settings: BookSettings) => void;
}) {
  if (!items.length)
    return (
      <section className="card pad">
        <div className="empty">
          Belum ada buku. Tambahkan bagian di halaman Produksi.
        </div>
      </section>
    );
  return (
    <div className="stack-lg">
      {items.map((x) => (
        <BookSettingsCard
          key={x.book}
          {...x}
          instagram={instagram}
          onRefreshInstagram={onRefreshInstagram}
          onSave={onSave}
        />
      ))}
    </div>
  );
}
function BookSettingsCard({
  news = false,
  book,
  settings,
  instagram,
  onRefreshInstagram,
  onSave,
}: {
  news?: boolean;
  book: string;
  settings: BookSettings;
  instagram: InstagramConnection;
  onRefreshInstagram: () => void;
  onSave: (book: string, settings: BookSettings) => void;
}) {
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [JSON.stringify(settings)]);
  const used = new Set(
    [draft.panelHorizontal, draft.panelVertical].filter(Boolean),
  );
  // Sumber panel selalu ikut dibuat.
  const set = (patch: Partial<BookSettings>) =>
    setDraft((d) => {
      const next = { ...d, ...patch };
      const needed = [next.panelHorizontal, next.panelVertical];
      next.stockKinds = IMAGE_LANES.map(([k]) => k).filter(
        (k) => next.stockKinds.includes(k) || needed.includes(k),
      );
      return next;
    });
  const toggle = (k: string) =>
    set({
      stockKinds: draft.stockKinds.includes(k)
        ? draft.stockKinds.filter((x) => x !== k)
        : [...draft.stockKinds, k],
    });
  const changed = JSON.stringify(draft) !== JSON.stringify(settings);
  const select = (
    label: string,
    value: string | null,
    options: string[],
    onChange: (v: string | null) => void,
  ) => (
    <label className="field">
      {label}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        {options.map((k) => (
          <option key={k} value={k}>
            {laneName(k)}
          </option>
        ))}
        <option value="">Tidak ada</option>
      </select>
    </label>
  );
  return (
    <section className="card pad stack">
      <div className="card-title">
        <h2 className="h3">{book}</h2>
        <button
          className="btn btn-pri btn-sm"
          disabled={
            !changed || (!draft.panelHorizontal && !draft.panelVertical)
          }
          onClick={() => onSave(book, draft)}
        >
          Simpan
        </button>
      </div>
      <div className="stack-sm">
        <label className="field">
          Akun Instagram tujuan
          <select
            aria-label={`Akun Instagram tujuan ${book}`}
            value={draft.instagramAccountId ?? ""}
            onChange={(e) =>
              set({ instagramAccountId: e.target.value || null })
            }
          >
            <option value="">Otomatis (jika hanya satu akun)</option>
            {(instagram.accounts ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                @{a.username}
              </option>
            ))}
            {draft.instagramAccountId &&
              !instagram.accounts?.some(
                (a) => a.id === draft.instagramAccountId,
              ) && (
                <option value={draft.instagramAccountId}>
                  Akun tersimpan tidak tersedia ({draft.instagramAccountId})
                </option>
              )}
          </select>
        </label>
        <div className="row-gap">
          <button className="btn btn-sec btn-sm" onClick={onRefreshInstagram}>
            Muat ulang akun Instagram
          </button>
          <small className="muted">
            Tujuan Post IG dan Reels IG, termasuk cronjob. Jika ada beberapa
            akun, pilih satu untuk {news ? "jenis berita" : "buku"} ini.
          </small>
        </div>
        {instagram.state !== "connected" && (
          <small className="warn">
            {instagram.reason ?? "Memuat akun Instagram…"}
          </small>
        )}
      </div>
      <div className="settings-grid">
        <div className="stack-sm">
          <b>Gambar yang dibuat</b>
          {IMAGE_LANES.map(([k, name, size]) => (
            <label key={k} className="check-row">
              <input
                type="checkbox"
                checked={draft.stockKinds.includes(k)}
                disabled={used.has(k)}
                onChange={() => toggle(k)}
              />
              <span>
                {name}
                <small className="block muted">
                  {size}
                  {used.has(k) ? " · dipakai panel" : ""}
                </small>
              </span>
            </label>
          ))}
        </div>
        <div className="stack-sm">
          <b>Gambar per kalimat</b>
          {IMAGE_LANES.map(([k, name, size]) => (
            <label key={k} className="check-row">
              <input
                type="checkbox"
                checked={draft.sentenceKinds.includes(k)}
                disabled={
                  draft.sentenceVideoKind === k ||
                  draft.sentenceVideoHKind === k
                }
                onChange={() =>
                  set({
                    sentenceKinds: draft.sentenceKinds.includes(k)
                      ? draft.sentenceKinds.filter((x) => x !== k)
                      : IMAGE_LANES.map(([x]) => x).filter(
                          (x) => x === k || draft.sentenceKinds.includes(x),
                        ),
                  })
                }
              />
              <span>
                {name}
                <small className="block muted">
                  {size} · satu per kalimat
                  {draft.sentenceVideoKind === k ||
                  draft.sentenceVideoHKind === k
                    ? " · dipakai video kalimat"
                    : ""}
                </small>
              </span>
            </label>
          ))}
          {select(
            "Sumber gambar Video Kalimat (1080×1920)",
            draft.sentenceVideoKind,
            VERTICAL_KINDS,
            (v) =>
              set({
                sentenceVideoKind: v,
                sentenceKinds: IMAGE_LANES.map(([x]) => x).filter(
                  (x) => x === v || draft.sentenceKinds.includes(x),
                ),
              }),
          )}
          {select(
            "Sumber gambar Video Kalimat H (1920×1080)",
            draft.sentenceVideoHKind,
            HORIZONTAL_KINDS,
            (v) =>
              set({
                sentenceVideoHKind: v,
                sentenceKinds: IMAGE_LANES.map(([x]) => x).filter(
                  (x) => x === v || draft.sentenceKinds.includes(x),
                ),
              }),
          )}
        </div>
        <div className="stack-sm">
          <b>Sumber gambar panel</b>
          {select(
            "Horizontal (template 1, 2, 6)",
            draft.panelHorizontal,
            HORIZONTAL_KINDS,
            (v) => set({ panelHorizontal: v }),
          )}
          {select(
            "Vertikal (template 4, 4B)",
            draft.panelVertical,
            VERTICAL_KINDS,
            (v) => set({ panelVertical: v }),
          )}
          {!draft.panelHorizontal && draft.panelVertical && (
            <small className="warn">
              Tanpa sumber horizontal, panel hanya memakai template 4/4B yang
              kolom teksnya lebih sempit; paragraf panjang bisa tidak muat.
            </small>
          )}
          {!draft.panelHorizontal && !draft.panelVertical && (
            <small className="warn">Pilih minimal satu sumber panel.</small>
          )}
        </div>
        {!news && (
          <div className="stack-sm">
            <b>Gaya gambar quote</b>
            <label className="field">
              Gambar quote
              <select
                value={draft.quoteImageStyle}
                onChange={(e) => set({ quoteImageStyle: e.target.value })}
              >
                {Object.entries(QUOTE_IMAGE_STYLES).map(([id, s]) => (
                  <option key={id} value={id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>
      <small className="muted">
        Perubahan berlaku untuk pembuatan berikutnya atau saat ↻; gambar dan
        panel yang sudah ada tidak dihapus.
      </small>
    </section>
  );
}
// Stok konten panel: satu kartu per bagian berisi 5 panel + slide penutup.
function PanelContent({
  rows,
  onOpen,
}: {
  rows: any[];
  onOpen: (c: any) => void;
}) {
  if (!rows.length)
    return (
      <section className="card pad">
        <div className="empty">
          Belum ada panel. Jalankan ▶ Panel di halaman Produksi.
        </div>
      </section>
    );
  return (
    <div className="stack-lg">
      {rows.map((c) => {
        const m = parse(c.panels);
        const files = [...m.panels.map((x: any) => x.file), m.closing];
        return (
          <section key={c.id} className="card pad stack">
            <div className="card-title">
              <div>
                <h2 className="h3">{c.title}</h2>
                <small className="muted">{m.footer}</small>
              </div>
              <button className="btn btn-sec btn-sm" onClick={() => onOpen(c)}>
                Buka bagian
              </button>
            </div>
            <div className="panel-strip">
              {files.map((f: string, i: number) => {
                const src = `/api/panels/${c.id}/${f}?v=${m.renderedAt}`;
                return (
                  <a key={f} href={src} target="_blank" rel="noreferrer">
                    <img
                      src={src}
                      alt={i < PANEL_COUNT ? `Panel ${i + 1}` : "Slide penutup"}
                      loading="lazy"
                    />
                  </a>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
const stripMarkdown = (t: string) => t.replace(/[*_`]/g, "");
function StageCell({ play }: { play: PlayProps }) {
  let main: React.ReactNode;
  if (play.busy)
    main = (
      <span
        className="spinner"
        role="status"
        title={play.title}
        aria-label={play.title}
      />
    );
  else if (play.done)
    main = (
      <>
        <span className="done" title={play.title} aria-label={play.title}>
          <Icon name="check" size={14} />
        </span>
        {play.redo && (
          <button
            className="play redo"
            title="Regenerate"
            aria-label={"Regenerate · " + play.title}
            onClick={play.redo}
          >
            <Icon name="redo" size={14} />
          </button>
        )}
      </>
    );
  else
    main = (
      <button
        className="play"
        title={play.title}
        aria-label={play.title}
        disabled={!play.run}
        onClick={play.run}
      >
        <Icon name="play" size={14} />
      </button>
    );
  return (
    <div className="stage-cell">
      {main}
      {play.view && (
        <button
          className="play redo"
          title={play.viewTitle ?? "Lihat artikel"}
          aria-label={play.viewTitle ?? "Lihat artikel"}
          onClick={play.view}
        >
          <Icon name="eye" size={14} />
        </button>
      )}
    </div>
  );
}
// Kerangka modal: tutup dengan ×, Esc, atau klik di luar.
function Modal({
  c,
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  c: any;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={"modal card" + (wide ? " wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <small className="muted">
              {subtitle ?? `${c.book} · ${c.title}`}
            </small>
            <h2>{title}</h2>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            aria-label="Tutup"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
// Modal stok gambar: tab per lajur, lima gambar terikat sesuai urutan panel.
// Stok panel (5 per lajur) atau, dengan `sentences`, gambar per kalimat
// (job S_<lajur>, satu per kalimat).
function StockModal({
  c,
  kinds,
  sentences,
  onClose,
  onCreate,
}: {
  c: any;
  kinds: string[];
  sentences?: string[];
  onClose: () => void;
  onCreate: (kind: string, name: string) => void;
}) {
  const job = (k: string) => (sentences ? sentenceJob(k) : k);
  const expected = sentences?.length ?? PANEL_COUNT;
  // Hanya lajur yang aktif di Pengaturan Konten buku ini.
  const lanes = IMAGE_LANES.filter(([k]) => kinds.includes(k));
  const [stock, setStock] = useState<any[] | null>(null),
    [kind, setKind] = useState(lanes[0]?.[0] ?? IMAGE_LANES[0][0]);
  useEffect(() => {
    api("/chapters/" + c.id)
      .then((d) => setStock(d.stock ?? []))
      .catch(() => setStock([]));
  }, [c.id]);
  const items = (stock ?? []).filter((x) => x.kind === job(kind));
  return (
    <Modal
      c={c}
      title={sentences ? "Gambar" : "Gambar panel"}
      onClose={onClose}
      wide
    >
      <div className="seg" role="tablist" aria-label="Jenis gambar">
        {lanes.map(([k, name]) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            className={kind === k ? "on" : ""}
            onClick={() => setKind(k)}
          >
            {name} · {(stock ?? []).filter((x) => x.kind === job(k)).length}/
            {expected}
          </button>
        ))}
      </div>
      {stock && items.length < expected && (
        <div className="row-gap">
          <button
            className="btn btn-pri btn-sm"
            disabled={c.article_status !== "siap"}
            onClick={() =>
              onCreate(
                job(kind),
                IMAGE_LANES.find(([k]) => k === kind)?.[1] ?? kind,
              )
            }
          >
            <Icon name="play" size={14} />
            Buat stok lajur ini
          </button>
          <small className="muted">
            Hanya lajur ini yang dibuat; lajur lain tidak berubah.
          </small>
        </div>
      )}
      {!stock ? (
        <p className="muted">Memuat…</p>
      ) : !items.length ? (
        <div className="empty">Belum ada gambar untuk jenis ini.</div>
      ) : (
        <div
          className={
            "stock-grid" + (HORIZONTAL_KINDS.includes(kind) ? " wide" : "")
          }
        >
          {items.map((x) => (
            <figure key={x.panel}>
              <a
                href={`/api/stock/${x.asset_id}/image`}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={`/api/stock/${x.asset_id}/image`}
                  alt={x.description}
                  loading="lazy"
                />
              </a>
              <figcaption>
                <span className="mono muted">
                  {sentences ? "Kalimat" : "Panel"} {x.panel}
                </span>
                <span>
                  {sentences ? sentences[x.panel - 1] : x.description}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </Modal>
  );
}
// Modal panel: tampilan besar + thumbnail, geser dengan tombol atau ←/→.
function PanelModal({ c, onClose }: { c: any; onClose: () => void }) {
  const m = parse(c.panels);
  const files: string[] = [...m.panels.map((x: any) => x.file), m.closing];
  const [i, setI] = useState(0);
  const go = (d: number) => setI((n) => (n + d + files.length) % files.length);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const src = (f: string) => `/api/panels/${c.id}/${f}?v=${m.renderedAt}`;
  const label = (n: number) =>
    n < PANEL_COUNT ? `Panel ${n + 1}` : "Slide penutup";
  return (
    <Modal c={c} title="Panel" onClose={onClose} wide>
      <div className="panel-viewer">
        <button
          className="btn btn-sec"
          aria-label="Sebelumnya"
          onClick={() => go(-1)}
        >
          ‹
        </button>
        <figure>
          <img src={src(files[i])} alt={label(i)} />
          <figcaption className="muted small">
            {label(i)}
            {i < PANEL_COUNT
              ? ` · template ${m.panels[i].template}`
              : ""} · {m.footer}
          </figcaption>
        </figure>
        <button
          className="btn btn-sec"
          aria-label="Berikutnya"
          onClick={() => go(1)}
        >
          ›
        </button>
      </div>
      <div className="thumbs">
        {files.map((f, n) => (
          <button
            key={f}
            className={"thumb" + (n === i ? " on" : "")}
            aria-label={"Tampilkan " + label(n)}
            onClick={() => setI(n)}
          >
            <img src={src(f)} alt="" />
            <span>{n < PANEL_COUNT ? n + 1 : "CTA"}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
// Konfirmasi Post IG: pratinjau carousel dan caption sebelum terbit ke publik.
function PostModal({
  c,
  target,
  onClose,
  onConfirm,
}: {
  c: any;
  target: { account: { id: string; username: string } | null; error: string };
  onClose: () => void;
  onConfirm: () => void;
}) {
  const m = parse(c.panels);
  const files: string[] = [...m.panels.map((x: any) => x.file), m.closing];
  const [caption, setCaption] = useState<string | null>(null);
  useEffect(() => {
    api(`/chapters/${c.id}/caption`)
      .then((r) => setCaption(r.caption))
      .catch((e) => setCaption("Gagal memuat caption: " + e.message));
  }, [c.id]);
  return (
    <Modal c={c} title="Post carousel ke Instagram" onClose={onClose} wide>
      {target.account ? (
        <p>
          Tujuan: <b>@{target.account.username}</b>
        </p>
      ) : (
        <p role="alert" className="warn">
          {target.error}
        </p>
      )}
      <div className="panel-strip">
        {files.map((f) => (
          <img
            key={f}
            src={`/api/panels/${c.id}/${f}?v=${m.renderedAt}`}
            alt=""
          />
        ))}
      </div>
      <label className="field">
        Caption ({caption ? [...caption].length : 0}/2200)
        <textarea readOnly rows={10} value={caption ?? "Memuat…"} />
      </label>
      <div className="row-gap">
        <button className="btn btn-sec" onClick={onClose}>
          Batal
        </button>
        <button
          className="btn btn-pri"
          disabled={!caption || !target.account}
          onClick={onConfirm}
        >
          Posting sekarang
        </button>
        <small className="muted">
          {files.length} gambar akan terbit sebagai satu carousel melalui NC-WA.
        </small>
      </div>
    </Modal>
  );
}
function ReelsModal({
  c,
  target,
  onClose,
  onConfirm,
}: {
  c: any;
  target: { account: { id: string; username: string } | null; error: string };
  onClose: () => void;
  onConfirm: () => void;
}) {
  const m = parse(c.sentence_video);
  const [caption, setCaption] = useState<string | null>(null);
  useEffect(() => {
    api(`/chapters/${c.id}/caption`)
      .then((r) => setCaption(r.caption))
      .catch((e) => setCaption("Gagal memuat caption: " + e.message));
  }, [c.id]);
  return (
    <Modal c={c} title="Post Reels ke Instagram" onClose={onClose} wide>
      {target.account ? (
        <p>
          Tujuan: <b>@{target.account.username}</b>
        </p>
      ) : (
        <p role="alert" className="warn">
          {target.error}
        </p>
      )}
      <video
        className="reels-player"
        controls
        preload="metadata"
        src={`/api/video-kalimat/${c.id}/${m.file}?v=${m.renderedAt}`}
      />
      <label className="field">
        Caption ({caption ? [...caption].length : 0}/2200)
        <textarea readOnly rows={10} value={caption ?? "Memuat…"} />
      </label>
      <div className="row-gap">
        <button className="btn btn-sec" onClick={onClose}>
          Batal
        </button>
        <button
          className="btn btn-pri"
          disabled={!caption || !target.account}
          onClick={onConfirm}
        >
          Posting sekarang
        </button>
        <small className="muted">
          Video {Math.round(m.duration)} dtk ({m.width}×{m.height}) akan terbit
          sebagai Reels melalui NC-WA.
        </small>
      </div>
    </Modal>
  );
}
// Modal baca artikel: judul, paragraf, atribusi, dan tag.
function ArticleModal({ c, onClose }: { c: any; onClose: () => void }) {
  const lines = String(c.article).replace(/\r\n/g, "\n").split("\n");
  const tags =
    lines
      .find((l) => l.startsWith("Tag:"))
      ?.slice(4)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean) ?? [];
  const blocks = String(c.article)
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b && !b.startsWith("# ") && !b.startsWith("Tag:"));
  const emphasis = (t: string) =>
    t
      .split(/(\*[^*]+\*)/g)
      .map((part, i) =>
        /^\*[^*]+\*$/.test(part) ? <em key={i}>{part.slice(1, -1)}</em> : part,
      );
  return (
    <Modal c={c} title={c.title} subtitle={c.book} onClose={onClose}>
      {blocks.map((b, i) =>
        // Heading hook (##) di atas paragraf hook.
        b.startsWith("## ") ? (
          <h3 key={i} className="h3">
            {b.slice(3)}
          </h3>
        ) : b.startsWith("Berdasarkan buku") ? (
          <p key={i} className="muted small">
            {b}
          </p>
        ) : (
          <p key={i}>{emphasis(b)}</p>
        ),
      )}
      {tags.length > 0 && (
        <div className="row-gap">
          {tags.map((t) => (
            <span key={t} className="chip t-none">
              {t}
            </span>
          ))}
        </div>
      )}
    </Modal>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

function StockGallery() {
  const [kind, setKind] = useState(IMAGE_LANES[0][0]),
    [items, setItems] = useState<any[] | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    setItems(null);
    setError("");
    api("/stock?kind=" + kind)
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  }, [kind]);
  const horizontal = HORIZONTAL_KINDS.includes(kind);
  return (
    <section className="card pad stack">
      <div className="card-title">
        <h2 className="h3">Kolam stok</h2>
        <div className="seg" role="group" aria-label="Lajur stok">
          {IMAGE_LANES.map(([k, name]) => (
            <button
              key={k}
              className={kind === k ? "on" : ""}
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <p className="muted">{error}</p>
      ) : !items ? (
        <p className="muted">Memuat stok…</p>
      ) : !items.length ? (
        <p className="muted">Belum ada gambar di lajur ini.</p>
      ) : (
        <div className={"gallery stock" + (horizontal ? " wide" : "")}>
          {items.map((a) => (
            <figure key={a.id}>
              <a href={a.url} target="_blank" rel="noreferrer">
                <img src={a.url} alt={a.description} loading="lazy" />
              </a>
              <figcaption>
                <b>{a.description}</b>
                <small className="muted">
                  {a.usage ? `Dipakai ${a.usage} konten` : "Belum dipakai"}
                </small>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
