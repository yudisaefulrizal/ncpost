# Final QA — implementasi awal NC Post Web

## Hasil nyata

- npm test: 10 files, 37 tests passed (Vitest 4.1.11).
- npm run typecheck: passed, termasuk scripts/.
- npm run build: passed (Vite 7.3.6, frontend React + Express Node API).
- npm run test:e2e: 1 passed; autentikasi, antrean sumber, detail, simpan draf, preview worker, Instagram-only. Menggunakan DB/key fixture, bukan provider live.
- npm audit: info/low/moderate/high/critical semuanya 0. Sharp diperbarui 0.35.5, Vitest 4.1.11.
- Live adapter text: official Codex CLI 0.160.0 merespons NCPOST_TEXT_OK.
- Live adapter image: file PNG foto asli, 1920×1080, 4248677 bytes, hash 6866d7b7a3f6923e8d6917b5e557722e3b725f736226211b400fe186f857988c. Metadata data/provider-probe.json, file output/probes/cli-image.png. Ini probe nyata terpisah, bukan stok lima panel.
- Live HTTP smoke: home 200, data tanpa sesi 401, origin asing 403, sesi lokal 200, 331 bab, template ID 1/2/4/4B/6.
- Live authenticated browser: desktop1440/mobile390, pagination pertama→kedua→pertama bekerja; dokumen tidak overflow dan tidak ada uncaught JS errors. Screenshot docs/qa/live-dashboard.png, docs/qa/live-mobile.png.
- Server bind hanya 127.0.0.1:8072; worker terpisah berjalan lokal. Tidak ada tunnel, service auto-start, scheduler, publikasi atau panggilan ElevenLabs live.
- .env permission0600, key tidak ditampilkan/masuk screenshot atau hasil smoke.

## Regresi diperbaiki test-first

Tes baru awalnya gagal, lalu seluruh suite kembali hijau:
- /accounts NC-WA adalah array root; hasil akun dipetakan server-side dan field rahasia dibuang.
- apply_patch bukan feature flag CLI0.160.0; argumen gambar diperbaiki dan diverifikasi melalui probe aplikasi live.
- Snapshot artikel generasi baru menambah revision; snapshot preview/editor lama dibatalkan dan tidak dapat menimpa hasil baru.
- Claim SQLite menserialkan pekerjaan di bab yang sama dan tetap mengizinkan bab berbeda.
- Pagination membatasi antrean panjang, clamp halaman setelah pencarian/filter.
- Prompt artikel/lexicon editor dipindah ke sumber aplikasi agar tidak dibaca dari artepak saat runtime.

## Batas implementasi (bukan pipeline selesai)

- Worker artikel/editor dan stok tiga gaya tersedia. Lima stok per bab dan review editorial worker belum diuji live end-to-end.
- Preview lima PNG+CTA adalah template-only, bukan compositing stok final/paket produksi siap tayang. Renderer final, pemilihan template otomatis lengkap dan video karaoke belum selesai.
- ElevenLabs: adapter/mock tests saja; LIVE_TTS=false dan UI/worker audio belum aktif.
- NC-WA key khusus aplikasi belum dikonfigurasi; koneksi akun authenticated belum diuji.
- OpenAPI live NC-WA hanya single image. Reels diblokir sebelum request, tanpa fallback carousel/foto atau provider lain.
- Tes lengkap/E2E perlu port8072 bebas; produksi dapat dijalankan ulang dengan npm start dan npm run worker pada dua terminal.
