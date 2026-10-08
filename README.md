# NC Post Web

<!-- Uji auto-deploy GitHub: 2026-10-08. -->

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

`npm run dev` menjalankan frontend Vite melalui server Express pada port yang sama. Server dan worker berjalan sebagai proses terpisah melalui `npm run dev` / `npm start`. Cronjob otomatis dapat diaktifkan per buku di halaman Cronjob. Bab tidak diimpor; judul buku dan judul bab diinput lewat aplikasi (form Tambah bab di Antrean).

Login memakai akun di tabel `users` (password hash scrypt). Akun default: `admin@gmail.com` / `admin123`. Cookie sesi ditandatangani `SESSION_SECRET` di `.env` (dibuat otomatis bila `.env` belum ada; minimal 16 karakter).

Setup database (sekali, password root hanya lewat env dan tidak disimpan): `MYSQL_ROOT_PASSWORD=... npm run db:setup`. Skrip membuat database, tabel (`src/server/schema.sql`), akun admin, dan user MySQL `ncpost` dengan hak SELECT/INSERT/UPDATE/DELETE serta CREATE/ALTER/INDEX/REFERENCES untuk migrasi; password-nya ditulis ke `DB_PASSWORD` di `.env`.

Update struktur database: `npm run migrate`. Koneksi memakai `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, dan `DB_PASSWORD` dari `.env`, hanya untuk `DB_NAME`; tidak membuat database/user atau akun admin. Perubahan tabel lama ditulis sebagai migrasi eksplisit di `src/server/migrations.ts`; mengedit `schema.sql` saja tidak mengubah tabel lama. Migrasi yang tersedia aman dijalankan ulang.

User database dari setup versi lama hanya memiliki hak CRUD. Administrator database perlu memberikan hak CREATE, ALTER, INDEX, REFERENCES pada database tersebut sekali sebelum migrasi dapat berjalan. Migrasi sendiri tidak membutuhkan kredensial root.

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

## Impor buku dari JSON

Di halaman Produksi, tombol **Impor JSON** membuat satu bagian untuk tiap entri file berformat:

```json
[
  {
    "buku": "How to Win Friends and Influence People",
    "tema": "Cara Membuat Orang Menyukai Anda - Biasakan tersenyum"
  },
  {
    "buku": "How to Win Friends and Influence People",
    "tema": "Cara Membuat Orang Menyukai Anda - Ingat dan gunakan nama orang dengan baik"
  }
]
```

`buku` menjadi judul buku dan `tema` menjadi judul bagian. Nomor bagian berurutan sesuai file dan melanjutkan nomor terbesar di bukunya. Entri yang sudah ada (buku dan judul sama, tanpa beda huruf besar/kecil dan spasi) dilewati, jadi aman diulang. Aplikasi menampilkan pratinjau dulu (jumlah baru dan yang dilewati) sebelum menulis. Maksimal 500 entri per impor; satu entri yang salah membatalkan seluruh impor.

Data di MySQL database `ncpost`; output hanya di `output/`. Hasil render tiap bagian ada di folder yang bisa dibaca, `output/<buku>/<NN-judul-bagian>/`:

```
output/how-to-win-friends-and-influence-people/02-ganti-kritik-dengan-empati/
├─ panel/        01-panel.jpg … 07-slide-penutup.jpg
├─ audio/        kalimat_01.mp3 …
├─ video-v.mp4   (9:16)      video-h.mp4   (16:9)
└─ quote.jpg
```

Nama folder mengikuti nomor bagian: mengubah atau mengurutkan ulang nomor mengganti nama foldernya (panel dan video dibuang karena memuat nomor lama), dan menghapus bagian menghapus foldernya. Kolam stok gambar (`output/stock`), salinan publik (`output/public`), `cache/`, dan `work/` tetap di tempatnya, dan namanya tidak dipakai sebagai nama folder buku. Hasil render lama per id dipindahkan dengan `npx tsx scripts/migrate-output.ts`. Template dan CTA disimpan di `asset/templates` dan `asset/closing-slide` dalam repository ini dan dibaca saja saat runtime. Semua prompt (artikel, review, quote, gambar quote, stok gambar, pembungkus Codex) dan lexicon editor ada di folder `prompts/`, satu file per prompt; lihat `prompts/README.md`.

## Status implementasi

| Bagian                                       | Implementasi                | Verifikasi                                                             |
| -------------------------------------------- | --------------------------- | ---------------------------------------------------------------------- |
| Auth, CSRF, sesi, API media                  | Aktif lokal                 | Unit + browser nyata                                                   |
| Antrean bab (input manual), pencarian/filter | Aktif                       | MySQL + browser                                                        |
| Artikel Codex + laporan editor               | Worker/job nyata            | Runner mock, parent live teks; editorial worker belum live             |
| Gambar CLI                                   | Adapter + tiga lane worker  | Parent live PNG; collector fixture nyata, worker lima panel belum live |
| Preview lima PNG + CTA                       | Aktif template-only         | Sharp + browser worker nyata                                           |
| ElevenLabs lima panel                        | Adapter HTTP; live diblokir | Mock HTTP saja                                                         |
| Video karaoke/produksi final                 | Belum tersedia; disabled    | Belum diuji                                                            |
| Instagram akun                               | GET dengan env key          | Parent OpenAPI; koneksi key aplikasi belum diuji                       |
| Instagram Reels                              | Diblokir sebelum network    | Guard unit; kontrak belum mendukung                                    |

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

## Cronjob per judul buku

Halaman **Cronjob** menyediakan 11 jadwal independen per buku: Artikel, Quote, Gambar Quote, Gambar Panel, Gambar Video, Audio, Video V, Video H, Panel, Post IG, dan Reels IG. Isi **setiap berapa jam** (angka bulat 1–8760), aktifkan, lalu simpan tiap jenis secara terpisah. Bawaan 24 jam dan nonaktif. Jadwal pertama berjalan setelah interval sejak disimpan; mengubah interval atau status lalu menyimpan memulai hitungan baru. Waktu berikutnya dan pemeriksaan terakhir tampil dalam WIB.

Worker mengantrekan satu bagian berikutnya yang belum selesai dan memenuhi prasyarat. Gambar mengikuti lajur Pengaturan Konten. Tidak membuat ulang hasil, menimpa draf, atau menggandakan job aktif. Post/Reels hanya mengirim status awal `belum`. Ketika worker mati melewati jadwal, satu pemeriksaan dilakukan saat worker kembali, lalu hitungan interval dilanjutkan dari pemeriksaan tersebut; tidak merapel semua interval yang terlewat. Penguncian MySQL menjaga eksekusi lintas worker.

Jalankan ulang `MYSQL_ROOT_PASSWORD=... npm run db:setup` untuk menambahkan kolom interval tanpa menghapus data. Jadwal lama memakai interval 24 jam; jadwal yang aktif mulai dihitung sejak migrasi.

## Akun Instagram per buku

Di **Pengaturan Konten**, pilih **Akun Instagram tujuan** pada masing-masing buku, lalu Simpan. Pilihan tersimpan dalam pengaturan buku dan dipakai worker untuk Post IG/carousel serta Reels IG, termasuk cronjob. Tombol **Muat ulang akun Instagram** mengambil daftar terkini dari NC-WA. Konfirmasi publikasi manual menampilkan akun tujuan.

Pilihan otomatis hanya berlaku jika NC-WA menyediakan satu akun. Jika beberapa akun tersedia, pilih tujuan per buku. Akun pilihan yang hilang tidak dialihkan ke akun lain. Perubahan tujuan berlaku pada job yang diproses berikutnya; hasil yang sudah terbit tetap tercatat dan tidak dikirim ulang. Pengaturan ini menggunakan kolom JSON yang sudah ada sehingga tidak membutuhkan migrasi database.

## Konten Berita

**Konten Berita → Produksi → Buat artikel** mengantrekan pencarian dan penulisan
artikel teknologi. Prompt `prompts/berita/skill-artikel-teknologi.md` disalin
utuh dari Hermes dan dikirim tanpa perubahan. Codex memakai live web search,
memilih tiga kandidat dari media yang diizinkan, memilih satu sumber, lalu
menulis artikel serta laporan sesuai instruksi sumber. Tahap produksi berikutnya
memakai komponen gambar, audio, render, dan Instagram yang sama dengan buku.

Artikel, tiga kandidat, alasan pemilihan, sumber, dan laporan validasi bisa
dibuka dari daftar produksi. Hasil dapat diunduh sebagai Markdown. Aplikasi
memeriksa judul teks biasa dan empat paragraf tanpa header, masing-masing tepat
dua kalimat lengkap, satu sumber terpilih, dan maksimal lima tag. Jumlah kata
dan karakter artikel tidak dibatasi.
Laporan fakta mengikuti riset model; selesai membuat artikel bukan status
lolos editor produksi buku. URL sumber yang sudah digunakan ditolak untuk
mencegah artikel duplikat. Kegagalan/lease kedaluwarsa perlu dicoba ulang
secara eksplisit, tanpa membuat ulang hasil yang telah selesai.

Jalankan `MYSQL_ROOT_PASSWORD=... npm run db:setup` untuk tabel artikel, antrean
media, ikatan stok, hasil per revisi, pengaturan, dan cron berita. Artefak
berita tersimpan di `output/berita/<id>/<percobaan>/`.
Worker berita mengaktifkan `code_mode_host` agar live web search dapat
dieksekusi, dengan shell dan browser interaktif tetap dinonaktifkan.
Log provider `events.jsonl` juga disimpan untuk diagnosis hasil yang ditolak.
Penyesuaian format pada `prompts/berita/format.md` diberikan sebagai instruksi
runtime terpisah. Gaya bahasa, urutan gagasan, dan riset dari Hermes tetap berlaku.

Tabel produksi berita memakai kontrol tahap yang sama dengan buku: centang
artikel selesai, generate ulang, dan lihat melalui modal. Kolom pertama
menampilkan Jenis Berita (saat ini Teknologi). Quote dan Gambar Quote tidak
ditampilkan. Gambar Panel, Gambar Video, Audio, Video V/H, Panel, Post IG,
dan Reels IG tersedia setelah prasyarat masing-masing terpenuhi.

**Pengaturan Konten** berita menyediakan lajur gambar panel/per kalimat, sumber
panel/video menurut orientasi, dan akun Instagram tujuan untuk Teknologi.
Gambar diikat ke artikel berita tetapi file/asetnya masuk ke kolam bersama
`assets` / `output/stock`; stok yang cocok dapat dipakai ulang. Menambah jenis
gambar hanya membuat lajur yang belum lengkap. Regenerate gambar membuat
aset baru tanpa menghapus kolam stok atau render yang tidak bergantung padanya.

Panel berita berisi empat paragraf tanpa header dan satu slide penutup.
Audio berita memakai Edge TTS per kalimat, default suara Indonesia
`id-ID-ArdiNeural`, tanpa memakai kredensial atau kuota ElevenLabs buku.
Pasang dependensi lokal sekali dengan:

```bash
python3 -m venv data/edge-tts
data/edge-tts/bin/python -m pip install -r requirements-tts.txt
```

`NEWS_EDGE_TTS=false` menonaktifkan audio berita. Suara dan kecepatan dapat diatur
melalui `NEWS_EDGE_TTS_VOICE` dan `NEWS_EDGE_TTS_RATE` (default `+0%`).
`EDGE_TTS_EXECUTABLE` dapat menunjuk executable absolut lain. Edge TTS memerlukan
koneksi internet; kegagalan layanan membuat job gagal tanpa beralih ke ElevenLabs.
Audio lama tetap tersedia; buat ulang Audio untuk menggantinya dengan Edge TTS,
lalu buat ulang Video V/H. Audio buku tetap mengikuti `LIVE_TTS` dan ElevenLabs.

 Video V/H memakai gambar per kalimat,
audio yang sama, subtitle, visualizer, dan CTA produksi buku. Hasil tersimpan
secara terpisah di `output/berita/media/<id>/<revisi>/<job>-<percobaan>/`.

Antrean media memakai snapshot artikel/pengaturan, satu proses per berita,
heartbeat, serta penguncian MySQL. Regenerate artikel diblokir selama produksi
aktif atau status publikasi belum pasti. Hasil dan riwayat publikasi disimpan
per revisi; hasil lama tidak dianggap sebagai hasil artikel yang baru.

Publikasi manual meminta konfirmasi akun tujuan. Request ID disimpan sebelum
memanggil NC-WA. Status processing dipantau, dan kegagalan komunikasi menjadi
unknown yang tidak dikirim ulang. Tombol **Periksa status Instagram** dalam
modal hanya mengambil status request tersebut. Caption memakai artikel dan
sumber berita, dengan tag `#berita`.

**Cronjob** berita menyediakan sembilan jadwal interval (1–8760 jam), tanpa
Quote/Gambar Quote, nonaktif secara default. Artikel mencari berita baru;
tahap lain memilih satu berita belum selesai yang memenuhi prasyarat. Jadwal
terlewat berjalan sekali, tanpa mengejar seluruh interval. Post/Reels otomatis
hanya berjalan setelah jadwalnya diaktifkan dan akun tujuan tersedia.
