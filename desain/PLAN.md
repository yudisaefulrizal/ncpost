# NC Post Web — Implementation Plan

**Goal:** Membuat ulang NC Post Buku sebagai aplikasi web Node.js yang mandiri, menggunakan Codex CLI untuk teks dan gambar, ElevenLabs untuk TTS, dan template lokal yang sudah disediakan pengguna.

## Keputusan terbaru — cakupan aktif MVP

- Fokus hanya Instagram melalui NC-WA, mengikuti pola koneksi virtual-office-multy-agent. YouTube dan platform lain ditunda: tidak dibuat adapter, route, job, konfigurasi, tombol atau kolom publikasinya pada MVP.
- Origin lokal `http://127.0.0.1:8072`; domain publik `https://ncpost.nuscode.id`. Tunnel akan diatur pengguna. Belum ada server/tunnel yang dijalankan dalam pekerjaan desain ini.
- Sebelum exposure publik: autentikasi dashboard/API server-side, secure session, CSRF/origin allowlist, rate limiting, proteksi log/SSE, serta route media publik terbatas dengan opaque URL untuk fetch provider. Jangan mengekspos direktori proyek, database atau secrets. Bind port sebelum worker/scheduler berjalan.
- Bagian YouTube di bawah hanya referensi skill sumber, BUKAN tugas implementasi aktif. Task K hanya Instagram NC-WA; task L tanpa YouTube; DoD publikasi hanya Instagram.
- Gambar desain terbaru harus Instagram-only; gambar revisi sebelumnya yang memuat YouTube adalah arsip konsep.
- Dukungan Reels/video NC-WA belum dibuktikan oleh referensi virtual-office yang hanya mempublikasikan satu gambar. Ini gate implementasi; tidak fallback ke foto/Zernio tanpa persetujuan.


**Architecture:** Web/API memanggil layanan domain dan worker persisten. Worker mengelola Codex CLI, stok artikel/audio/gambar, rendering lokal, serta publikasi Instagram melalui NC-WA. Referensi Zernio/YouTube historis di bawah ditunda dan bukan scope MVP. Aplikasi tidak membutuhkan Hermes sebagai runtime; skill lama menjadi spesifikasi migrasi, bukan dependency instalasi Hermes.

**Tech Stack (usulan, belum diimplementasikan):** Node.js + TypeScript, Next.js, SQLite, worker Node.js terpisah, Sharp dan renderer teks lokal yang dievaluasi terhadap template, FFmpeg/ffprobe, Vitest, Playwright. Versi paket dipilih saat implementasi setelah mengecek kompatibilitas Node dan dependensi.

## 1. Status deliverable dan batas pekerjaan

- `01-dashboard.png` dan `02-detail-produksi.png` adalah mockup gambar hasil model, bukan aplikasi berjalan.
- Mockup dibuat melalui tool gambar sesi ini, backend openai-codex, model `gpt-image-2-medium`. Ini BUKAN bukti bahwa generate gambar melalui executable Codex CLI sudah terverifikasi.
- Pekerjaan saat ini hanya desain dan rencana; tidak membuat aplikasi, menjalankan publikasi, atau mengetes ElevenLabs berbayar.
- Keputusan pengguna: teks dan gambar memakai Codex CLI. Jangan menggantinya dengan OAuth privat, API-key OpenAI, atau Hermes runtime tanpa persetujuan pengguna.
- ElevenLabs belum berlangganan aktif. Implementasi adapter direncanakan, live testing ditunda; status harus jujur `disabled`/`blocked`, bukan `connected` atau `ready` palsu.

## 2. Sumber kebenaran

Root sumber:
`/home/nuscode/projek/- nuscode/ncpost/ncpost-hermes`

- Kontrak utama: `skill/` — delapan skill pilihan pengguna.
- Template SATU-SATUNYA: `/home/nuscode/projek/- nuscode/ncpost/ncpost-hermes/asset/templates`.
- CTA: `/home/nuscode/projek/- nuscode/ncpost/ncpost-hermes/asset/closing-slide` — terpisah dari template.
- Antrean sumber: `app/ncpost/buku/queue/bacaan-harian.json`.
- Kontrak TTS: `app/ncpost/shared/tts/ELEVENLABS_TTS_CONTRACT.md`.
- Stok/helper app: `app/ncpost/shared/tts/tts_stock.py`.

Helper yang masih dirujuk skill namun tidak terdapat di delapan folder terpilih berada di arsip:
`/home/nuscode/projek/- nuscode/ncpost/ncpost-pipline-2026/artepak/artepak-skill`

Utamanya `skill-ncpost-buku/scripts/`, `skill-ncpost-artikel-to-gambar-lokal/scripts/`, `skill-artikel-buku-ilustrasi/`, `skill-ncpost-editor/`, dan `skill-post/`.
Pelajari/port kontrak helper tersebut ke aplikasi baru. Jangan menjalankan skill all-in-one lama atau menghidupkan kembali pipeline lain. Jangan memodifikasi sumber backup.

## 3. Kontrak delapan skill yang wajib dipertahankan

| Tahap | Skill sumber | Kontrak inti |
|---|---|---|
| Artikel | skill-ncpost-buku-generate-artikel | Satu bab per run; round-robin jika bab tidak diberikan; artikel lima paragraf; validasi + editor sebelum stok/status selesai |
| TTS | skill-ncpost-buku-generate-tts | Hanya membaca artikel valid; lima audio; default eleven_v3; tidak menulis ulang artikel |
| Stok horizontal | skill-ncpost-buku-stok-realistic-horizontal | Realistic, landscape; scoring registry; generate hanya slot belum terpenuhi; maksimal tiga percobaan per panel |
| Stok vertikal realistic | skill-ncpost-buku-stok-realistic-vertikal | Portrait asli; stok ternormalisasi 1080×1920; independen dari stok horizontal |
| Stok vertikal minimalist | skill-ncpost-buku-stok-minimalist-vertikal | Minimalist Black-and-White Line Art with Selective Color Accent; portrait asli; registry terpisah |
| Produksi | skill-ncpost-buku-produksi | Lima PNG 1080×1350 + CTA; video Reels karaoke; integritas lolos sebelum status_konten siap; tidak publish |
| Instagram | skill-ncpost-buku-post | Publish video Reels yang sudah siap melalui Zernio; tidak menghasilkan artikel/TTS/video |
| YouTube | skill-ncpost-buku-post-youtube | Publish video siap ke YouTube via Zernio; metadata terpisah; tidak bergantung pada status Instagram |

Artikel mengikuti dependency `skill-artikel-buku-ilustrasi/SKILL.md`: tepat lima paragraf, maksimal 40 kata per paragraf, judul `#` dan satu heading `##` identik untuk paragraf 1, paragraf 2–5 tanpa heading, atribusi buku setelah isi, maksimal lima tag di akhir. Struktur isi bebas; jangan menambahkan pembagian peran paragraf yang kaku. Penulisan tanpa riset web sesuai sumber; jangan mengarang kutipan, tokoh, angka, atau detail buku. Gate editor mencakup lint deterministik dan review makna.

Pisahkan status domain: `konten_dasar.status_artikel`, `konten_dasar.status_tts`, `stok_visual.*`, `produksi.buku.status_konten`, `produksi.buku.status_publikasi`, dan `produksi.buku.status_publikasi_youtube`. Job execution state tidak boleh menggantikan status domain ini.

## 4. Aturan template yang dikunci pengguna

- Tidak membuat template konten baru dengan model gambar.
- Tidak memakai template generik pada thumbnail konsep sebagai sumber produksi.
- Seluruh overlay template berasal dari folder templates yang ditentukan, termasuk subfoldernya. CTA memakai closing-slide yang sudah tersedia.
- Batasi template aktif ke registry renderer: `1 Default`, `2 Gambar Bawah`, `4 Vertikal Kiri`, `4B Vertikal Kanan`, `6 Minimalist Flat Pastel Illustration`.
- Template `3` dan `5` masih ada sebagai file, tetapi dinonaktifkan oleh registry. Jangan membuat katalog otomatis yang mengaktifkan semua PNG hanya karena file tersedia.
- Set `total=5` untuk progress overlay lima panel isi. CTA panel keenam terpisah; varian overlay of-04/of-06 bukan alasan mengubah jumlah panel buku.
- Randomisasi template per panel hanya di antara template aktif yang teksnya muat. Simpan seed dan template terpilih di render plan untuk retry yang konsisten.
- Template 4/4B hanya masuk kandidat bila stok vertikal panel itu tersedia. Jika stok vertikal tidak tersedia, gunakan kandidat horizontal 1/2/6 sesuai perilaku renderer; ini fallback layout, bukan fallback video menjadi carousel.
- Nama Vertikal Kiri/Kanan adalah nama registry; jangan menebak lokasi gambar dari nama. Pakai geometri aktual.

Geometri sumber `template_registry.py` (x1,y1,x2,y2; semua piksel pada 1080×1350):

| ID | Window gambar | Text left / width | Heading y / size / line-height | Body size / line-height | Footer y |
|---|---|---|---|---|---|
| 1 | 90,92,990,598 | 130 / 820 | 734 / 54 / 64 | 35 / 46 | 1205 |
| 2 | 90,746,990,1252 | 130 / 820 | 184 / 54 / 64 | 35 / 46 | 655 |
| 4 | 630,60,1020,1290 | 94 / 482 | 246 / 44 / 54 | 30 / 40 | 1149 |
| 4B | 60,60,450,1290 | 504 / 482 | 246 / 44 / 54 | 30 / 40 | 1149 |
| 6 | 50,40,1030,1102 | 100 / 880 | 1175 / 39 / 46 | 22 / 30 | 1280 |

Gunakan gap 24 pada 1/2, 20 pada 4/4B, 3 pada 6; overflow margin 20. Validasi terhadap kode sumber dan hasil render sebelum menyatakan port setara. Renderer lama memakai DejaVuSans regular/bold; jangan mengganti font produksi dengan font dashboard karena akan mengubah wrapping.

## 5. Arah UI setelah studi skill

Primary surface: Operate — tabel antrean, aksi per tahap, progress nyata. Detail konten: Command/Inspect — artikel, validasi, preview panel/video, log.

Navigasi: Dashboard, Antrean Buku, Artikel, Audio TTS, Stok Gambar, Produksi, Publikasi, Pengaturan.

- Dashboard memisahkan status Instagram dan YouTube, bukan satu kolom published global.
- Detail menampilkan lima panel isi + CTA; mode panel adalah preview proses, bukan opsi publish carousel foto.
- Preview template menggunakan thumbnail overlay ASLI dan ID/nama registry, bukan label fiktif Editorial 01, Klasik Modern, dll. pada mockup.
- Editor menampilkan batas 40 kata per paragraf, satu heading, atribusi, tag, dan hasil gate editor.
- Jika editor belum lolos, artikel ditampilkan `draft/menunggu validasi`, bukan `siap`. Mockup detail awal memiliki ketidaksesuaian ini dan perlu diperbaiki saat UI diimplementasikan.
- Stok gambar dan TTS bisa dikerjakan setelah artikel valid secara independen; stepper tidak boleh menyiratkan gambar harus selalu menunggu TTS. Produksi video penuh tetap memerlukan audio yang valid.
- Status provider berasal dari probe nyata, bukan label hard-coded. Status ElevenLabs tetap belum diuji sampai live check diizinkan.
- Tombol TTS disabled selama live TTS dinonaktifkan. Preview panel boleh tersedia; render final/publish tidak dinyatakan siap tanpa audio dan gate media.
- Pilihan minimalist vertikal adalah stok independen, bukan izin memperluas pipeline produksi buku ke gaya/pipeline lain secara otomatis.
- Tampilan terang/aksen hijau hanya untuk UI aplikasi. Jangan mewarnai ulang template konten aslinya.
- Desktop tiga pane; tablet dua pane; mobile tab Editor/Preview/Inspector. Target klik >=44px, focus state, status tertulis selain warna.

## 6. Arsitektur dan lokasi file usulan

Semua path implementasi berikut relatif ke `ncpost-web/`; belum dibuat.

```text
src/app/                         halaman dan API lokal Next.js
src/components/                  sidebar, chapter-table, stage-status, preview
src/server/db/                   SQLite schema, migration, repositories
src/server/domain/               chapter, article, stock, production, publish
src/server/jobs/                  durable queue, lease, retry, events
src/server/providers/codex/      text runner dan image capability adapter
src/server/providers/elevenlabs/ adapter TTS terpisah
src/server/publishing/zernio/    upload, publish, poll, reconcile
src/server/rendering/            registry, text metrics, PNG, FFmpeg
src/server/storage/              file store, hash, path allowlist
src/worker/main.ts               proses worker terpisah
src/prompts/                     port instruksi skill dan editor
scripts/                         import legacy, capability probes
 tests/unit/                     pengujian domain/provider dengan fixture
 tests/integration/              worker/SQLite/media
 tests/e2e/                      Playwright dashboard/detail
 data/                           SQLite dan job state lokal, tidak ke Git
 output/stock/                   artikel/audio/stok gambar baru
 output/konten/<slug>/           output konten permanen
 desain/                         mockup + plan + hasil studi
```

Root template dikunci lewat konfigurasi server ke path pengguna, read-only. Future packaging boleh menyalin BYTE-IDENTICAL aset yang diizinkan, bukan menciptakan template baru. Output dan data baru hanya milik ncpost-web. Jangan menulis balik antrean sumber saat import.

## 7. Codex CLI: gerbang kompatibilitas sebelum implementasi pipeline

Teramati di mesin saat studi: `codex-cli 0.160.0`; help exec menyediakan `--ignore-user-config`, `--ignore-rules`, `--ephemeral`, `--json`, `--output-schema`, `--skip-git-repo-check`, dan sandbox. Ini bukti flag lokal, bukan bukti model/gambar bekerja.

1. Jalankan `codex --version`, `codex exec --help`, dan `codex login status` saat mulai implementasi. Jangan membaca/menyalin token dari ~/.codex atau ~/.hermes.
2. Text runner memakai child_process.spawn dengan argv array, shell:false, cwd workspace job terisolasi, stdout/stderr teredaksi, timeout dan cancel. Tutup stdin setelah prompt terkirim. Model override hanya setelah model yang diminta benar-benar diterima; default CLI jika pengguna belum memilih model.
3. Structured output divalidasi server. Output gagal/parsial tidak boleh mengubah stok/status ke selesai.
4. Buat spike gambar CLI tersendiri: cek dukungan image-generation/tool/event pada versi CLI/account aktual; lakukan satu generate kecil yang memang diizinkan, simpan PNG nyata dan bukti metadata/ukuran/checksum.
5. CLI `--image` adalah INPUT referensi, bukan bukti OUTPUT image generation tersedia. Jangan menganggap perintah CLI gambar tertentu ada tanpa help/docs/probe.
6. Jika gambar CLI tidak tersedia, tandai capability unavailable dan laporkan blocker kepada pengguna. Jangan diam-diam mengganti dengan Hermes tool/API privat atau gambar dummy. Desain yang telah dibuat melalui tool gambar sesi ini tidak memenuhi gate CLI tersebut.
7. Login dilakukan pengguna melalui flow resmi CLI. Web tidak meminta password atau token ChatGPT. Batas filesystem/sandbox harus diuji; prompt/read-only sandbox saja bukan isolasi rahasia.

## 8. Rencana implementasi berurutan (RED → GREEN per task)

Setiap task: tulis test gagal terlebih dahulu, jalankan focused test, implementasi minimal, ulang focused test, lalu full suite. Belum menjalankan langkah implementasi dalam dokumen ini.

### A. Scaffold dan konfigurasi
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `src/server/config.ts`.
- Test: `tests/unit/config.test.ts`; root template harus tepat path pengguna, liveTts default false, output tidak di source backup; rahasia tidak diserialisasi ke browser.
- Validasi: `npm run typecheck`, `npm test -- tests/unit/config.test.ts`, `npm run build` setelah script tersedia.

### B. Inventaris template dan allowlist
- Create: `src/server/rendering/template-registry.ts`, `scripts/inventory-templates.ts`.
- Test: `tests/unit/template-registry.test.ts`; hanya ID 1/2/4/4B/6 aktif; template 3/5 ditolak; overlay of-05 tersedia untuk setiap panel; symlink/path traversal keluar template root ditolak.
- Simpan path relatif, geometri dan hash file. Tidak scan arsip sebagai fallback template.

### C. Import antrean read-only
- Create: `scripts/import-legacy.ts`, `src/server/db/schema.ts`, `src/server/domain/chapters.ts`.
- Test: `tests/unit/queue-import.test.ts`, `tests/unit/chapter-selection.test.ts`; round-robin sama dengan selector sumber, nomor/buku/bab terjaga, import idempoten, tidak menulis file sumber.
- Stok/konten yang statusnya siap tetapi file hilang harus `inconsistent`, bukan dianggap tersedia. Jangan menyimpulkan kesiapan dari JSON saja.

### D. Durable jobs dan progress
- Create: `src/server/jobs/store.ts`, `runner.ts`, `events.ts`, `src/worker/main.ts`.
- Test: `tests/integration/jobs.test.ts`; klaim atomik, duplikat run 409, resume setelah restart, lease expired, cancel, retries terbatas, browser ditutup tidak menghentikan job.
- Pisahkan job queued/running/blocked/completed/failed/unknown dari status domain skill. Jangan mulai worker saat proses gagal bind port.

### E. Adapter teks Codex CLI
- Create: `src/server/providers/codex/text-runner.ts`, `capabilities.ts`, `scripts/probe-codex.ts`.
- Test: `tests/unit/codex-runner.test.ts`; fake executable, stdin EOF, schema invalid, exit nonzero, timeout, redaction, model rejection.
- Live probe teks terpisah dari unit tests; hanya tandai connected/verified berdasarkan hasil nyata.

### F. Artikel dan editor
- Create: `src/prompts/article.md`, `editor.md`, `src/server/domain/article-validator.ts`, `article-service.ts`.
- Test: `tests/unit/article-validator.test.ts`; 4/6 paragraf gagal, paragraf >40 kata gagal, heading tambahan/mismatch gagal, atribusi/tag salah gagal, editor belum lolos tidak siap.
- Port checklist editor sumber; simpan article_validation/editor_report. Reuse stok artikel valid, tidak overwrite otomatis atau membuat suffix versi.

### G. Stok gambar Codex CLI
- Create: `src/server/providers/codex/image-runner.ts`, `src/server/domain/visual-stock.ts`, `visual-scoring.ts`.
- Test: `tests/unit/visual-stock.test.ts`; scoring/threshold sama sumber, panel tidak memakai asset ID sama dua kali, registry gaya/rasio terpisah, kegagalan maksimal tiga percobaan dan slot tetap null.
- Gate live gambar CLI harus lulus sebelum integrasi dianggap ready.
- Landscape generation -> stok 1920×1080; portrait generation asli -> normalisasi 1080×1920. Jangan menghasilkan landscape lalu menyebutnya portrait asli. Jangan stretch.
- Model gambar hanya untuk stok visual; tidak membuat template overlay maupun screenshot sebagai output produksi.

### H. ElevenLabs tanpa live testing
- Create: `src/server/providers/elevenlabs/tts.ts`, `src/server/domain/tts-text.ts`, `tts-stock.ts`.
- Test: `tests/unit/tts-text.test.ts`, `elevenlabs-adapter.test.ts` dengan HTTP mock eksplisit; lima audio nonempty + narration JSON; kegagalan parsial tidak status selesai; tidak menulis ulang artikel.
- Default eleven_v3, format mp3_44100_128; flash v2.5 hanya opt-in pengguna. Sanitasi dan tag mengikuti model_id, tidak mencampur SSML Flash dengan bracket v3.
- LIVE_TTS=false memblokir network call sebelum client dibuat; UI menjelaskan langganan belum aktif. Tidak mengetes endpoint berbayar, tidak membuat MP3 palsu yang dianggap keluaran ElevenLabs.
- Catat test mocked != validated live. Aktivasi langganan dan izin live test adalah gate terpisah nanti.

### I. PNG renderer dan preview template asli
- Create: `src/server/rendering/text-layout.ts`, `panel-renderer.ts`, `render-plan.ts`.
- Test: `tests/integration/panel-renderer.test.ts`; lima PNG 1080×1350, heading hanya panel 1, progress 1..5, footer buku/bagian, no overflow, stok portrait hanya untuk template 4/4B.
- Port ukuran font/geometri; bandingkan hasil PNG terhadap overlay/renderer sumber dan periksa visual. Jangan mengatasi overflow dengan mengubah artikel otomatis.
- Preview full text berbeda dari PNG video --skip-body-text. Label jelas agar pengguna tidak mengira teks hilang adalah error.

### J. Video karaoke dan CTA
- Create: `src/server/rendering/video-renderer.ts`, `karaoke.ts`, `media-validation.ts`.
- Test: `tests/integration/video-renderer.test.ts` dengan audio fixture yang dinyatakan sebagai fixture, bukan hasil ElevenLabs.
- Teks seluruh paragraf terlihat sejak awal; hanya highlight kata sinkron audio, bukan reveal per baris.
- Timeline/word alignment ditelaah dari renderer sumber dan dibuktikan lewat fixture; jangan menjanjikan timing presisi jika alignment belum tersedia.
- Reuse `asset/closing-slide/minimalist-line-art-cta/slide-penutup-cta.mp4` dan audio tertanam; jangan TTS ulang CTA. Frame CTA juga menjadi 06-slide-penutup.png.
- ffprobe, durasi, audio stream, dimensi dan integrity_check gate harus lolos. Tidak ada fallback publish carousel ketika render video gagal.
- Tanpa audio valid hanya preview, bukan konten siap tayang.

### K. Publikasi terpisah Instagram/YouTube — revisi pilihan pengguna
- Instagram mengikuti `/home/nuscode/projek/- nuscode/virtual-office-multy-agent/src/orchestrator/instagram.ts`: konektor NC-WA, base URL `https://ncwa.nuscode.id/api/v1/instagram`, API key server-side, GET /accounts untuk status akun dan permission instagram_business_content_publish. Bukan login Meta langsung dan bukan Zernio untuk Instagram.
- Create: `src/server/publishing/ncwa/client.ts`, `instagram.ts`, `src/server/publishing/zernio/youtube.ts`, `reconcile.ts`. YouTube tetap konektor terpisah sesuai skill, tidak diasumsikan tersedia di NC-WA.
- Simpan kredensial khusus ncpost-web secara aman; jangan menyalin key/token dari virtual-office atau mencetak nilainya. UI hanya status koneksi dan masked key. Detail input secret akan mengikuti mekanisme konfigurasi aman saat implementasi.
- REFERENSI SAAT INI hanya membuktikan publikasi satu image via POST /posts {requestId, igUserId, imageUrl, caption} dan polling GET /posts/:requestId. Dukungan Reels/video NC-WA BELUM terverifikasi. Jangan mengirim videoUrl ke endpoint yang hanya terbukti menerima imageUrl; cek kontrak NC-WA sebelum implementasi Reels. Bila belum tersedia, Instagram video tetap blocked; tidak fallback ke gambar atau Zernio tanpa keputusan pengguna.
- Test: `tests/unit/publishing.test.ts`; publish tidak menghasilkan konten baru; platform field terisolasi; requestId persist sebelum POST; timeout -> unknown + reconcile, bukan resend. Scope/status akun/target harus diverifikasi, jangan pilih akun pertama diam-diam bila ambigu.
- Instagram: tetap Reels video siap, caption plain text <=2200 karakter dan #buku; tidak mewarisi payload content/customContent Zernio ke NC-WA.
- YouTube: article+video, judul dari heading <=100 karakter, deskripsi sendiri + atribusi/tags; validasi API aktual. IG dan YT independen. Jangan membuat playlist otomatis.
- Success HTTP bukan published; poll sampai status published dan mediaId nyata tersimpan. Unknown tidak melepaskan guard duplicate. RequestId baru tidak boleh dibuat untuk retry outcome yang belum pasti.
- Live publishing tidak dilakukan oleh tests, desain, atau import. Memerlukan aksi eksplisit pengguna.

### L. UI sesuai desain, kontrak, dan data nyata
- Create: `src/app/page.tsx`, `src/app/chapters/[id]/page.tsx`, `src/app/settings/page.tsx`, components dan route jobs/events/templates/media.
- Test: `tests/e2e/dashboard.spec.ts`, `chapter-detail.spec.ts`, `templates.spec.ts`.
- Thumbnail template adalah overlay asli; preview hasil render deterministik, bukan gambar model UI awal. Tambahkan status IG/YT terpisah, validasi artikel yang konsisten, serta lane TTS/gambar independen.
- Uji desktop/mobile, akses keyboard, provider disabled, empty state, error retry, progress setelah refresh.

### M. End-to-end dan packaging
- Buat `README.md`, `scripts/start-local.ts`, backup/restore data baru dan .env.example tanpa secret.
- Jalankan `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` setelah scripts tersedia; expected gates PASS, bukan hasil yang sudah terjadi.
- Text/image live probe dilaporkan terpisah; TTS live ditunda; publish live ditunda sampai izin eksplisit.
- Scheduler fase setelah manual flow stabil: timezone Asia/Jakarta, jobs independen tiap tahap, default paused. Jangan mengimpor cron Hermes otomatis.

## 9. Risiko dan ketidaksesuaian sumber

1. Path absolut lama masih menunjuk /home/nuscode/ncpost dan ~/.hermes. Port memakai root konfigurasi baru, bukan mengganti file backup.
2. Delapan skill belum self-contained: parser, editor, rendering, template registry, sanitasi TTS, dan posting helper perlu dipelajari/diport dari arsip.
3. Dokumen TTS umum memiliki contoh empat panel/audio; skill buku dan generate_tts.py memakai lima audio + slot closing. Gunakan kontrak buku lima panel, catat ketidaksesuaian tanpa mengubah source diam-diam.
4. Deskripsi horizontal menyebut artikel+TTS pada satu bagian, tetapi Mode B command memakai --require-artikel-sudah. Eligibility operasional mengikuti command/kontrak aktual: artikel valid cukup untuk stok gambar; produksi final tetap butuh TTS.
5. Template 3/5 file masih ada tetapi tidak aktif. ID 6 bisa tidak muat semua paragraf; gunakan overflow probe, bukan jaminan selalu bisa dipilih.
6. Source selector scoring belum menjamin file registry ada; service baru harus cek existence sebelum reuse. Tidak menganggap registry/status JSON cukup.
7. Klaim Shorts otomatis dalam skill perlu dicek ke persyaratan YouTube aktual saat implementasi. Jangan mengklaim klasifikasi hanya karena durasi; periksa rasio/durasi/hasil platform.
8. Stok dan konten lama sekarang arsip; import opsional harus explicit/read-only dan memvalidasi missing assets, bukan memindahkan seluruh arsip ke proyek baru.
9. Screenshot model bisa mengandung label/metrik/contoh tidak persis kontrak; gambar desain bukan spesifikasi template dan bukan bukti pipeline berhasil.

## 10. Definition of Done bertahap

- Desain/plan: PNG nyata tersedia; studi kontrak dan sumber template terdokumentasi; belum ada implementasi aplikasi.
- MVP tanpa TTS live: dashboard/domain/worker/CLI teks-gambar tervalidasi, stok dan preview template asli; TTS adapter lolos mocked tests namun disabled live.
- Produksi lengkap: setelah izin/aktivasi ElevenLabs, lima audio nyata tervalidasi, karaoke+CTA lulus gate FFmpeg, status_konten siap benar-benar punya paket lengkap.
- Publikasi lengkap: akun target terverifikasi dan aksi pengguna disetujui; status published + ID/URL platform nyata tersimpan independen per platform.

Tidak menyatakan aplikasi selesai hanya karena scaffold, mockup, job queued, atau mocked tests berhasil.
