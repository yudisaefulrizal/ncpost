# Video Vektor

Judul → naskah → narasi → kode animasi Remotion + Three.js → video final. Produksi memakai satu sesi agen AI per proyek, Codex CLI, Claude Code CLI, atau Cline CLI, dengan cara pembuatan adegan yang mengacu pada contoh kode gaya visual terpilih (bawaan: video kucing yang sudah disetujui). Agen menulis ilustrasi, aksi objek, kamera, dan perpindahan adegan langsung dalam kode.

## Studio

```bash
npm start
```

Buka **http://localhost:8077**. `npm run dev` membuka aplikasi yang sama; port bisa diubah melalui `PORT` di `.env`. `npm run studio` membuka editor Remotion untuk sumber video kucing di **http://localhost:8078**.

Server internal renderer memakai port **8078**, terpisah dari port 3000 yang dapat dipakai dan dibersihkan otomatis oleh bridge WhatsApp Hermes. Pengaturan ini ada di `remotion.config.ts`.

- Masukkan judul, pilih mulai sekarang atau jadwalkan dalam WIB.
- Pilih **Agen AI** (Codex, Claude, atau Cline) dan **Gaya visual** untuk setiap video.
- Pantau tahap produksi, aktivitas sesi agen, dan jumlah frame selesai melalui **WebSocket**.
- Atur **Timeout (menit)** sebelum mulai atau ubah dan simpan saat pekerjaan berjalan. **0 berarti tanpa batas**. Batas dihitung sejak pekerjaan dimulai; tidak ada batas tetap 20 menit atau batas maksimum lain dari aplikasi.
- Tekan **Stop** untuk menghentikan pekerjaan beserta proses turunannya. Jika proses belum keluar, tersedia **Paksa Stop**. Pekerjaan yang dihentikan tidak diulang otomatis.
- Gunakan **Lanjutkan** jika ingin meneruskan secara manual. Naskah, sesi agen, kode, dan audio dipakai kembali. Render yang terputus dimulai ulang dari awal.
- Putar atau unduh hasil melalui halaman **Hasil**.
- **Hapus** menghapus seluruh proyek: antrean, video, audio, naskah, kode proyek, cache, dan temporary directory milik proyek. Proses berjalan beserta turunannya dihentikan sebelum berkas dibersihkan. Konfirmasi menyebutkan bahwa seluruh berkas proyek akan dihapus.

Antrean dan jadwal tersimpan di `.cache/video-pipeline/studio/jobs.json`. Jadwal berjalan satu per satu selama aplikasi aktif. Pekerjaan lain yang sudah Anda antrekan tetap mengikuti jadwalnya. Produksi dari terminal memakai kunci proses yang sama; UI dapat menampilkan dan menghentikannya serta mengubah timeout-nya.

## Persiapan

Memerlukan Node.js 22+, minimal satu agen AI yang sudah login (Codex CLI dengan akun ChatGPT, Claude Code CLI dengan langganan Claude, atau Cline CLI yang sudah diatur dengan `cline auth`), Google Chrome, Python 3, dan FFmpeg/ffprobe.

```bash
git clone https://github.com/yudisaefulrizal/video-vektor.git
cd video-vektor
npm ci
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
codex login                                  # jika memakai Codex
npm install -g @anthropic-ai/claude-code     # jika memakai Claude
claude login
npm install -g cline                         # jika memakai Cline
cline auth
```

Pipeline menggunakan login yang tersimpan di CLI (ChatGPT untuk Codex, langganan Claude untuk Claude Code), tanpa API key atau model gambar; `OPENAI_API_KEY`/`ANTHROPIC_API_KEY` sengaja diabaikan. Cline memakai provider dan kredensial yang Anda atur lewat `cline auth`. Mode headless Cline tidak mendukung melanjutkan sesi, jadi **Lanjutkan** dengan Cline memulai sesi baru yang tetap memakai naskah, kode, dan audio tersimpan. Model mengikuti konfigurasi CLI. `.env.example` memuat pengaturan opsional untuk agen bawaan (`AGENT`), executable/model Codex dan Claude, suara narasi, port, dan renderer. Browser dikonfigurasi di `remotion.config.ts` (`/usr/bin/google-chrome`).

Catatan keamanan: Codex berjalan dalam sandbox `workspace-write`. Claude Code CLI tidak memakai sandbox OS; ia hanya dibatasi pada alat `Bash, Read, Edit, MultiEdit, Write, Glob, Grep`, dan Bash dapat menjalankan perintah apa pun sebagai pengguna Anda. Cline berjalan dengan `--auto-approve true` tanpa sandbox, sehingga semua aksinya disetujui otomatis.

## Alur produksi

1. Membuat folder proyek berdasarkan judul.
2. Dalam satu sesi agen, membaca `skill/pembuat-naskah.md` dan menyimpan hasilnya ke `hasil/<id>/naskah.json`. Skill tidak diedit.
3. Menjalankan helper audio yang sudah ada untuk narasi, timing kata, transkrip audio SRT, dan musik.
4. Melanjutkan sesi yang sama untuk menulis kode adegan berdasarkan naskah dan timing, memakai contoh kode gaya visual terpilih (`styles/<gaya>/contoh/`) sebagai acuan dan titik awal. Setiap proyek memiliki sumber Remotion sendiri dan menyimpan gayanya.
5. Setelah agen menyiapkan kode, proses utama aplikasi merender seluruh durasi video dalam satu pemanggilan Remotion. Progres frame tetap dikirim ke UI melalui WebSocket.
6. Menggabungkan gambar dan audio, menyimpan enam berkas final, lalu membersihkan file sementara.

Tidak ada pemanggilan AI terpisah untuk arahan, setiap kelompok aset, atau setiap kelompok gerakan. Jalur produksi baru tidak memakai kontrak JSON animasi, DSL gerakan, atau batas buatan jumlah entity/shot. Tahap pada UI adalah laporan pekerjaan dalam sesi yang sama.

Video baru memakai narasi untuk menjelaskan dan animasi untuk memperlihatkan. Adegan mengikuti perkembangan gagasan; setiap kalimat tidak harus menghasilkan pergantian adegan atau teks. Teks visual digunakan secara selektif untuk angka, rumus, istilah penting, label objek, dan kesimpulan singkat, terintegrasi dengan animasi pada waktu yang relevan. Transkrip narasi tidak ditampilkan sebagai subtitle dan tidak ada fitur pilihan subtitle. Kebijakan ini tidak mengubah proyek lama atau `skill/pembuat-naskah.md`.

Pipeline tidak otomatis menjalankan typecheck, pengujian, render sampel, storyboard, atau perencanaan ulang berdasarkan penilaian visual. Metadata dan kelengkapan video utuh tetap diperiksa untuk penggabungan dan penyimpanan. Pemeriksaan kualitas cerita dan gerakan dilakukan pengguna pada video final.

## Gaya visual

Setiap gaya adalah satu folder di `styles/` berisi `style.md` (nama, deskripsi, panduan untuk agen) dan `contoh/` (contoh kode Remotion yang disalin sebagai titik awal proyek). Gaya baru langsung muncul di UI tanpa mengubah kode. Gaya baru dimulai dari kerangka netral `styles/_kerangka/` (format saja) dan didefinisikan lewat aturan di `style.md`, bukan dengan meniru gaya lain. Panduan lengkap ada di [`styles/README.md`](styles/README.md). Gaya bawaan diatur dengan `STYLE` di `.env`.

## Terminal

```bash
npm run video -- "Penemuan mesin uap dan dampaknya"

# Pilih agen AI (default dari AGENT di .env, lalu claude):
npm run video -- "Judul video" --agent claude

# Pilih gaya visual (nama folder di styles/):
npm run video -- "Judul video" --style vektor-kucing

# Lanjutkan proyek memakai naskah, sesi, kode, dan audio yang tersimpan:
npm run render -- --project penemuan-mesin-uap-dan-dampaknya

# Batas dari pengguna dalam detik; 0 = tanpa batas:
npm run video -- "Judul video" --timeout 3600

# Buat ulang naskah atau penyutradaraan atas permintaan:
npm run video -- "Judul video" --regenerate
npm run render -- --project judul-video --replan

# Render gambar ulang dari kode proyek:
npm run render -- --project judul-video --force

# Gabungkan gambar yang sudah lengkap:
npm run assemble -- --project judul-video
```

Judul yang sama menggunakan folder yang sama. Gunakan `--id nama-khusus` bila diperlukan. `npm run render` tanpa argumen memilih proyek terakhir yang selesai; jika belum ada penunjuk proyek, perintah itu memakai alur video kucing lama.

## Penyimpanan dan pembersihan

Satu proyek menyimpan satu hasil terbaru:

```text
hasil/<id-proyek>/
├── source/
│   ├── index.ts
│   ├── Root.tsx
│   ├── Film.tsx
│   ├── Story.tsx
│   ├── edit.ts
│   ├── timeline.json
│   └── components/
├── video.mp4
├── narasi.wav
├── musik.wav
├── audio-final.wav
├── naskah.json
└── subtitle.srt
```

Audio berupa WAV stereo 48 kHz. `narasi.wav` berisi suara bersih pada timing video; `musik.wav` berisi musik pada level video; `audio-final.wav` diambil dari audio video final.

`subtitle.srt` tetap disimpan dengan nama yang sama sebagai data transkrip audio bertiming untuk kebutuhan internal. Berkas ini disebut **Transkrip audio** di daftar unduhan; data transkrip dan timing kata tetap tersedia untuk sinkronisasi animasi.

Kode animasi tiap video disimpan permanen di `hasil/<id>/source/`, terpisah dari kode video lain dan berdampingan dengan naskah serta hasil finalnya. Render, preview, dan perbaikan kode memakai folder ini. Kode tetap tersedia saat produksi gagal maupun setelah pembersihan cache. Kode proyek lama di `.cache/video-pipeline/projects/<id>/source/` otomatis dipindahkan saat proyek dilanjutkan atau perintah preview/still dijalankan; folder source yang sudah ada di hasil tidak ditimpa.

Timeline kerja, cache audio, ID sesi agen (terpisah untuk Codex dan Claude; Cline tidak menyimpan sesi), dan cache gambar video yang sudah selesai dirender tetap berada di `.cache/video-pipeline/projects/<id>/`. Salinan timeline untuk kompilasi animasi berada di `source/timeline.json`. Cache ini dipertahankan untuk melanjutkan pekerjaan tanpa membuat ulang bagian yang sudah tersedia. Hasil proyek lama tetap dapat dibuka dari UI. Folder `hasil/` dan `.cache/` tetap diabaikan Git; repositori menyimpan kode pipeline, bukan hasil produksi lokal.

Jika produksi gagal, **Detail** menampilkan pesan kegagalan dan progres terakhir. Log render/penggabungan terbaru tersimpan di `.cache/video-pipeline/projects/<id>/production.log`; kegagalan helper juga dicatat ke `failure.json` di folder yang sama. Log tetap tersedia setelah file sementara dibersihkan.

File sementara Chromium, bundle Remotion, FFmpeg, dan kandidat hasil memakai `.vtmp/r-*/`. Folder kerja dibersihkan saat sesi selesai atau gagal. Render tidak dibagi per 200 frame. File render yang belum selesai dibuang; jika dihentikan, render berikutnya dimulai dari awal. Gambar video yang sudah selesai dapat dipakai kembali jika proses terhenti saat penggabungan audio, dan dibersihkan setelah hasil final berhasil disimpan. Penghentian paksa bisa meninggalkan folder kerja; pembersihan berikutnya menangani folder milik pipeline tersebut. Penggantian hasil memakai penyimpanan sementara dengan pemulihan jika pemindahan berkas gagal; versi lama tidak disimpan setelah penggantian berhasil.

```bash
npm run clean:dry -- --project judul-video
npm run clean -- --project judul-video
npm run clean:cache -- --project judul-video
```

Sumber, final video/audio/naskah, font, dependensi, dan temporary directory global dipertahankan. Narasi memakai Edge TTS dan cache berdasarkan teks/suara/rate/checksum; koneksi internet diperlukan ketika audio perlu dibuat.

## Perintah manual

```bash
npm run verify -- --project judul-video
npm run render:preview -- --project judul-video
npm run still -- --project judul-video
```

Perintah ini hanya berjalan bila dipanggil. Preview/poster masuk folder laporan di cache. Perintah review/storyboard berbasis rencana JSON lama tetap khusus proyek lama. Sumber video kucing di `styles/vektor-kucing/contoh/` dan hasil yang sudah ada tidak diubah oleh produksi judul baru.

## Bagian kode

- `scripts/run-project.mjs`: membuka atau melanjutkan satu sesi produksi dan membaca kontrol pengguna.
- `scripts/lib/agent-session.mjs`: menjalankan Codex CLI, Claude Code CLI, atau Cline CLI dan meneruskan aktivitas operasionalnya.
- `scripts/session-step.mjs`: helper audio yang dipanggil sesi agen, serta render dan penyimpanan hasil yang dijalankan proses utama.
- `scripts/lib/studio-store.mjs`: antrean, jadwal, Stop, dan pengaturan timeout.
- `scripts/studio-server.mjs` dan `studio/`: UI lokal, API kontrol, dan WebSocket status.
- `scripts/lib/pipeline.mjs`: cache, lock, proses, publish, dan cleanup yang sudah ada.
- `styles/<gaya>/`: panduan (`style.md`) dan contoh kode (`contoh/`) setiap gaya visual. `styles/vektor-kucing/contoh/` adalah sumber video kucing yang disetujui. `styles/_kerangka/` berisi format wajib tanpa tampilan gaya apa pun, sebagai titik awal gaya baru. Lihat `styles/README.md` untuk menambah gaya.
- `src/generic/`: renderer lama untuk proyek berbasis rencana JSON.

Font disertakan beserta lisensinya. Audio, video, cache, dan antrean lokal tidak diunggah ke repositori. Ilustrasi dibuat sendiri; aset Kurzgesagt tidak digunakan.
