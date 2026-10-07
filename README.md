# NC Post Web

Aplikasi lokal Node.js 22.23+ untuk antrean buku, editor artikel, worker persisten, stok gambar Codex CLI, dan preview template asli. UI berbahasa Indonesia; satu tujuan publikasi: Instagram Reels melalui NC-WA. Belum merupakan pipeline produksi video lengkap.

## Menjalankan

Dependensi telah diinstal melalui npm oleh parent, menggunakan registry normal. Pilihan React/Vite + Express mempertahankan API ringan dan worker Node terpisah; bukan karena Next.js atau npm tidak tersedia. Database memakai MySQL 8 (`mysql2`), database `ncpost` dan `ncpost_test` untuk test.

```bash
npm run typecheck
npm test
npm run build
npm start
```

Server hanya bind `127.0.0.1:8072`. Di terminal kedua, pada direktori yang sama:

```bash
npm run worker
```

`npm run dev` menjalankan frontend Vite melalui server Express pada port yang sama. Worker tidak otomatis dimulai oleh HTTP server. Tidak ada scheduler, tunnel, atau publikasi otomatis. Bab tidak diimpor; judul buku dan judul bab diinput lewat aplikasi (form Tambah bab di Antrean).

Login memakai akun di tabel `users` (password hash scrypt). Akun default: `admin@gmail.com` / `admin123`. Cookie sesi ditandatangani `SESSION_SECRET` di `.env` (dibuat otomatis bila `.env` belum ada; minimal 16 karakter).

Setup database (sekali, password root hanya lewat env dan tidak disimpan): `MYSQL_ROOT_PASSWORD=... npm run db:setup`. Skrip membuat database, tabel (`src/server/schema.sql`), akun admin, dan user MySQL `ncpost` yang hanya punya SELECT/INSERT/UPDATE/DELETE; password-nya ditulis ke `DB_PASSWORD` di `.env`.

Untuk deployment HTTPS yang nanti diatur pengguna, set `PUBLIC_HTTPS=true` agar cookie memakai Secure. Origin publik yang diizinkan adalah `https://ncpost.nuscode.id`; origin lokal `http://127.0.0.1:8072`. Session HMAC HttpOnly SameSite=Strict kedaluwarsa 8 jam, mutasi membutuhkan Origin tepat, login dibatasi. API, template, CTA, dan preview media membutuhkan sesi. Shell login/frontend tersedia tanpa sesi tetapi tidak membawa data antrean atau key. Jangan mengekspose folder proyek lewat web server lain.

## Provider

Login resmi: `codex login`, cek `codex login status` atau `npm run probe`. Tidak ada form password ChatGPT, API-key OpenAI, atau dependency Hermes. CODEX_EXECUTABLE opsional, CODEX_MODEL opsional; default model CLI akun. Runner memakai argv, shell:false, stdin EOF, timeout, cwd per job, allowlist env yang tidak membawa key aplikasi/provider. Auth tetap ditangani CLI resmi; aplikasi tidak membaca auth.json.

Bukti parent: teks `NCPOST_TEXT_OK` dan satu PNG asli melalui CLI; rincian di [PARENT-PROVIDER-CHECK.md](docs/PARENT-PROVIDER-CHECK.md). Adapter gambar mengambil PNG fresh dari thread CLI terverifikasi, menolak symlink/path arbitrary, memvalidasi orientasi dan menormalisasi tanpa stretch. Worker menyediakan realistic landscape, realistic portrait dan minimalist portrait secara independen. Worker baru **belum diuji live** untuk lima panel. Adapter gambar memakai sandbox workspace-write dengan shell/unified-exec/browser dimatikan dan code_mode_host tetap aktif. Adapter aplikasi sendiri sudah diuji live dan menghasilkan PNG valid 1920×1080 di output/probes/cli-image.png; detail data/provider-probe.json. Ini probe, bukan lima stok panel atau produksi final. Tidak ada klaim worker lima panel telah diuji live.

`LIVE_TTS=false` default. Adapter HTTP ElevenLabs dan sintesis lima panel tersedia (eleven_v3, mp3_44100_128), tetapi UI/worker TTS belum diaktifkan; tes HTTP adalah mock. Tidak ada panggilan live atau audio palsu. Credentials khusus aplikasi dapat diset melalui ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID setelah aktivasi langganan dan pengerjaan gate audio.

NCWA_API_KEY harus key khusus ncpost-web, server-side. `/accounts` dicek hanya jika key diatur, respons ke browser tersanitasi. OpenAPI yang diperiksa parent hanya membuktikan single image; tidak ada Reels. Semua submission diblokir sebelum network. Tidak ada fallback foto, POST live, requestId palsu, atau status published palsu. Poll/reconcile outcome submission belum diimplementasikan karena submission belum diizinkan kontrak.

## Alur kerja

Cari/filter bab → Buka → Generate artikel → worker memanggil Codex dan lint → job EDITOR menilai makna dengan catatan spesifik tiap pemeriksaan. Laporan mengandung lint struktur, temuan lexicon/istilah asing sumber, keputusan, waktu dan provider. Lolos struktur saja berstatus menunggu editor. Review yang meminta revisi tidak otomatis mengarang hasil perbaikan; sunting draf dan jalankan review kembali. Tidak ada klaim review makna sudah dilakukan pada artikel yang hanya disimpan manual.

Simpan draf membatalkan job aktif, menambah revisi dan menghapus pointer hasil turunannya. Regenerasi artikel membutuhkan aksi eksplisit. Job duplikat ditolak, klaim SQLite atomik, heartbeat lease 5 menit, crash dipulihkan sampai dua klaim sebelum gagal; hasil revisi lama tidak dapat menimpa draf baru. Stock per gaya/rasio berada pada folder revisi berbeda dan PNG yang cocok diverifikasi sebelum reuse. File lama tidak dihapus otomatis.

Preview boleh dibuat setelah lint struktur, tetapi diberi label template-only dan tidak membuka gate produksi. Worker menghasilkan lima PNG 1080×1350 memakai Template 1 asli, DejaVuSans, geometri registry, heading hanya panel 1, progress of-05, footer buku/bagian. CTA berasal dari closing-slide asli. Gallery menampilkan hanya ID 1,2,4,4B,6. Preview API/renderer dapat menguji 1/2/6; vertical tanpa portrait ditolak. Pemilihan template acak, skor registry sumber, crop stok aktual, font parity piksel dengan Pillow, dan renderer final belum selesai. Jangan menyebut preview sebagai stok gambar atau paket siap tayang.

Data di MySQL database `ncpost`; output hanya di `output/`. Template dan CTA sumber dibaca saja. Semua prompt (artikel, review, quote, gambar quote, stok gambar, pembungkus Codex) dan lexicon editor ada di folder `prompts/`, satu file per prompt; lihat `prompts/README.md`.

## Status implementasi

| Bagian | Implementasi | Verifikasi |
|---|---|---|
| Auth, CSRF, sesi, API media | Aktif lokal | Unit + browser nyata |
| Antrean bab (input manual), pencarian/filter | Aktif | MySQL + browser |
| Artikel Codex + laporan editor | Worker/job nyata | Runner mock, parent live teks; editorial worker belum live |
| Gambar CLI | Adapter + tiga lane worker | Parent live PNG; collector fixture nyata, worker lima panel belum live |
| Preview lima PNG + CTA | Aktif template-only | Sharp + browser worker nyata |
| ElevenLabs lima panel | Adapter HTTP; live diblokir | Mock HTTP saja |
| Video karaoke/produksi final | Belum tersedia; disabled | Belum diuji |
| Instagram akun | GET dengan env key | Parent OpenAPI; koneksi key aplikasi belum diuji |
| Instagram Reels | Diblokir sebelum network | Guard unit; kontrak belum mendukung |

## Pengujian

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
```

Playwright browser disimpan di `data/playwright`, hanya dalam proyek. Mesin Ubuntu 26.04 belum dikenali versi Playwright ini; instalasi menggunakan build Ubuntu 24.04 yang berhasil berjalan:

```bash
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 PLAYWRIGHT_BROWSERS_PATH=./data/playwright npx playwright install chromium
```

Tes memakai akun admin default dan database MySQL `ncpost_test`, tidak memakai credential pengguna. Tes menyalakan dan menghentikan HTTP/worker sendiri. Tidak ada live provider exec, TTS atau publish dalam tes. Bukti RED/GREEN dan hasil final di [TEST-EVIDENCE.md](docs/TEST-EVIDENCE.md); screenshot fixture di `docs/browser-dashboard.png` dan `docs/browser-dashboard-detail.png`. QA dashboard produksi desktop/mobile dan pagination ada di `docs/qa/`. Hasil final parent di docs/FINAL-QA.md. Server dan worker kini berjalan background lokal (bukan service auto-start); tidak ada commit dibuat. Hentikan server lokal sebelum menjalankan test:e2e atau seluruh suite yang menggunakan port 8072.

## Menjalankan

```sh
npm run dev      # pengembangan: server + worker, restart otomatis saat kode berubah
npm start        # produksi: build frontend lalu jalankan server + worker
```

Satu perintah menjalankan server (http://127.0.0.1:8072) dan worker sekaligus; `Ctrl+C` menghentikan keduanya. Perubahan skema database: `MYSQL_ROOT_PASSWORD=... npm run db:setup` (idempoten). Contoh service systemd (opsional, gaya nc-wa) ada di `deploy/`.
