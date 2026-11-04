# Video Vektor

Judul → naskah → narasi → kode animasi Remotion + Three.js → video final. Produksi memakai satu sesi Codex CLI per proyek, dengan cara pembuatan adegan yang mengacu pada video kucing yang sudah disetujui. Codex menulis ilustrasi, aksi objek, kamera, dan perpindahan adegan langsung dalam kode.

## Studio

```bash
npm start
```

Buka **http://localhost:8077**. `npm run dev` membuka aplikasi yang sama; port bisa diubah melalui `PORT` di `.env`. `npm run studio` membuka editor Remotion untuk sumber video kucing di **http://localhost:8078**.

Server internal renderer memakai port **8078**, terpisah dari port 3000 yang dapat dipakai dan dibersihkan otomatis oleh bridge WhatsApp Hermes. Pengaturan ini ada di `remotion.config.ts`.

- Masukkan judul, pilih mulai sekarang atau jadwalkan dalam WIB.
- Pantau tahap produksi, aktivitas sesi Codex, dan jumlah frame selesai melalui **WebSocket**.
- Atur **Timeout (menit)** sebelum mulai atau ubah dan simpan saat pekerjaan berjalan. **0 berarti tanpa batas**. Batas dihitung sejak pekerjaan dimulai; tidak ada batas tetap 20 menit atau batas maksimum lain dari aplikasi.
- Tekan **Stop** untuk menghentikan pekerjaan beserta proses turunannya. Jika proses belum keluar, tersedia **Paksa Stop**. Pekerjaan yang dihentikan tidak diulang otomatis.
- Gunakan **Lanjutkan** jika ingin meneruskan secara manual. Naskah, sesi Codex, kode, dan audio dipakai kembali. Render yang terputus dimulai ulang dari awal.
- Putar atau unduh hasil melalui halaman **Hasil**.
- **Hapus** menghapus seluruh proyek: antrean, video, audio, naskah, kode proyek, cache, dan temporary directory milik proyek. Proses berjalan beserta turunannya dihentikan sebelum berkas dibersihkan. Konfirmasi menyebutkan bahwa seluruh berkas proyek akan dihapus.

Antrean dan jadwal tersimpan di `.cache/video-pipeline/studio/jobs.json`. Jadwal berjalan satu per satu selama aplikasi aktif. Pekerjaan lain yang sudah Anda antrekan tetap mengikuti jadwalnya. Produksi dari terminal memakai kunci proses yang sama; UI dapat menampilkan dan menghentikannya serta mengubah timeout-nya.

## Persiapan

Memerlukan Node.js 22+, Codex CLI yang sudah login melalui akun ChatGPT, Google Chrome, Python 3, dan FFmpeg/ffprobe.

```bash
git clone https://github.com/yudisaefulrizal/video-vektor.git
cd video-vektor
npm ci
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
codex login
```

Pipeline menggunakan login ChatGPT yang tersimpan di Codex CLI, tanpa API key atau model gambar. Model mengikuti konfigurasi CLI. `.env.example` memuat pengaturan opsional untuk executable/model Codex, suara narasi, port, dan renderer. Browser dikonfigurasi di `remotion.config.ts` (`/usr/bin/google-chrome`).

## Alur produksi

1. Membuat folder proyek berdasarkan judul.
2. Dalam satu sesi Codex, membaca `skill/pembuat-naskah.md` dan menyimpan hasilnya ke `hasil/<id>/naskah.json`. Skill tidak diedit.
3. Menjalankan helper audio yang sudah ada untuk narasi, timing kata, subtitle, dan musik.
4. Melanjutkan sesi yang sama untuk menulis kode adegan berdasarkan naskah dan timing, memakai sumber video kucing sebagai acuan. Setiap proyek memiliki sumber Remotion sendiri.
5. Setelah Codex menyiapkan kode, proses utama aplikasi merender seluruh durasi video dalam satu pemanggilan Remotion. Progres frame tetap dikirim ke UI melalui WebSocket.
6. Menggabungkan gambar dan audio, menyimpan enam berkas final, lalu membersihkan file sementara.

Tidak ada pemanggilan AI terpisah untuk arahan, setiap kelompok aset, atau setiap kelompok gerakan. Jalur produksi baru tidak memakai kontrak JSON animasi, DSL gerakan, atau batas buatan jumlah entity/shot. Tahap pada UI adalah laporan pekerjaan dalam sesi yang sama.

Pipeline tidak otomatis menjalankan typecheck, pengujian, render sampel, storyboard, atau perencanaan ulang berdasarkan penilaian visual. Metadata dan kelengkapan video utuh tetap diperiksa untuk penggabungan dan penyimpanan. Pemeriksaan kualitas cerita dan gerakan dilakukan pengguna pada video final.

## Terminal

```bash
npm run video -- "Penemuan mesin uap dan dampaknya"

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
├── video.mp4
├── narasi.wav
├── musik.wav
├── audio-final.wav
├── naskah.json
└── subtitle.srt
```

Audio berupa WAV stereo 48 kHz. `narasi.wav` berisi suara bersih pada timing video; `musik.wav` berisi musik pada level video; `audio-final.wav` diambil dari audio video final.

Sumber animasi disimpan di `.cache/video-pipeline/projects/<id>/source/`, bersama timeline, cache audio, ID sesi Codex, dan cache gambar video yang sudah selesai dirender. Ini dipertahankan untuk melanjutkan pekerjaan tanpa membuat ulang bagian yang sudah tersedia. Hasil proyek lama tetap dapat dibuka dari UI.

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

Perintah ini hanya berjalan bila dipanggil. Preview/poster masuk folder laporan di cache. Perintah review/storyboard berbasis rencana JSON lama tetap khusus proyek lama. Sumber video kucing di `src/` dan hasil yang sudah ada tidak diubah oleh produksi judul baru.

## Bagian kode

- `scripts/run-project.mjs`: membuka atau melanjutkan satu sesi produksi dan membaca kontrol pengguna.
- `scripts/lib/codex-session.mjs`: menjalankan Codex CLI dan meneruskan aktivitas operasionalnya.
- `scripts/session-step.mjs`: helper audio yang dipanggil sesi Codex, serta render dan penyimpanan hasil yang dijalankan proses utama.
- `scripts/lib/studio-store.mjs`: antrean, jadwal, Stop, dan pengaturan timeout.
- `scripts/studio-server.mjs` dan `studio/`: UI lokal, API kontrol, dan WebSocket status.
- `scripts/lib/pipeline.mjs`: cache, lock, proses, publish, dan cleanup yang sudah ada.
- `src/Story.tsx`, `src/edit.ts`, `src/Film.tsx`, `src/components/`: sumber video kucing sebagai acuan produksi.

Font disertakan beserta lisensinya. Audio, video, cache, dan antrean lokal tidak diunggah ke repositori. Ilustrasi dibuat sendiri; aset Kurzgesagt tidak digunakan.
