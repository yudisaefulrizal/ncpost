# Bukti pengujian — 5 Oktober 2026

Semua command dijalankan pada ncpost-web menggunakan dependensi npm terpasang. Parent melakukan npm install sukses melalui registry; kegagalan sandbox run terdahulu bukan bukti npm/network host tidak tersedia. Tidak ada publikasi, live TTS, atau provider exec live dalam suite.

## RED → GREEN yang teramati pada continuation

- **Kontrak artikel:** tambahan kasus source-shaped `## Judul\nParagraf 1` dan `Tag: buku, kebiasaan sehari hari` gagal pada validator awal (`expected false to be true`, 23:56). Validator diganti parser berbasis line/body blocks; focused suite 10/10 GREEN 23:57. Hitungan fixture lama ternyata 7 kata, bukan 8; diperbaiki berdasarkan kata literal. Kasus negatif heading tambahan/mismatch, >40 kata, atribusi hilang dan >5 tag tetap diuji. Tidak ada kewajiban hashtag.
- **Store:** tests/store.test.ts sudah ada sebelum Store. Implementasi pertama diuji; dua kegagalan membuktikan fixture lama mengharapkan stok tetap inconsistent sesudah edit dan PREVIEW pada artikel kosong. Fixture diperbaiki dengan memastikan inconsistent sebelum save, lalu belum setelah invalidasi; PREVIEW recovery memakai artikel source-shaped valid. GREEN 4/4 00:00. Duplicate, atomic claim, stale revision dan recovery dua attempts tetap diuji.
- **Provider:** tests/providers.test.ts RED module providers belum ada 23:57. Setelah runner/adapter/guard implementasi, GREEN 4/4 00:00. Mock child executable membaca stdin sampai EOF; timeout harus reject. Bad JSON/missing final reject. LIVE_TTS=false dan publish Reels menolak sebelum fetch. Laporan editor tanpa catatan/checks ditolak.
- **Preview renderer:** tests/render.test.ts RED module render belum ada 23:59. GREEN setelah Sharp/font path renderer: dimensi PNG 1080×1350, vertical tanpa portrait ditolak, overflow template 6 ditolak. Ini preview template-only, bukan uji video final atau parity piksel dengan renderer Pillow.
- **UI/browser:** tes E2E ditulis sebelum HTTP/UI. Run awal RED server http.ts belum ada. Sesudah implementasi, browser binary belum terpasang. Playwright versi terpasang belum mengenali Ubuntu 26.04; binary Ubuntu 24.04 diunduh ke data/playwright dan berjalan sukses. Tes berikut GREEN: login salah/benar, API/media tanpa session 401, mutasi tanpa Origin 403, session HttpOnly SameSite Strict, localStorage kosong, real queue, simpan draf, job PREVIEW, worker nyata lima PNG+CTA, pengaturan, UI hanya Instagram. Worker berhenti di finally; Playwright menghentikan HTTP server.
- **Lexicon/editor:** tests/editor.test.ts RED module editor belum ada 00:05. GREEN setelah membaca lexicon dan istilah asing sumber read-only. `kulakan` dan terjemahan `kerja mendalam` tercatat sebagai temuan, tidak diganti mekanis. Review semantik model tetap diperlukan; fixture tidak mengklaim review AI selesai.
- **Codex image:** typecheck sempat RED karena tes collector yang disediakan parent belum menemukan module. Collector GREEN 5/5: fixture PNG nyata, thread allowlist, freshness, orientasi, symlink, error events, normalisasi 1920×1080. Seluruh fixture di data proyek. Parent live PNG adalah bukti terpisah di PARENT-PROVIDER-CHECK.md; worker lima panel belum diuji live.
- **Heartbeat stok:** tambahan tes gate editorial/heartbeat RED `s.heartbeat is not a function` 00:10, kemudian GREEN setelah lease heartbeat ditambahkan. Ini mencegah job image panjang dipulihkan ketika worker aktif.
- **Lima TTS mocked:** tambahan tes RED `synthesizeFive is not a function` 00:11, kemudian GREEN setelah adapter lima paragraf. HTTP mock eksplisit memeriksa model eleven_v3 dan lima call; bytes fixture bukan bukti audio valid ElevenLabs, tidak disimpan sebagai output produksi.
- **Auth baseline:** tests/security.test.ts sudah tersedia saat continuation; 4/4 GREEN. Tidak mengklaim RED fungsional yang tidak teramati. Tes port loser merupakan regresi: proses gagal bind keluar 1, tidak mulai worker atau HTTP bootstrap data.

## Hasil akhir

- `npm test`: **32/32 PASS**, 8 file; 00:12.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS**, frontend production dist/index.html + CSS/JS (Vite 7.3.6).
- `npm run test:e2e`: **1/1 PASS**, Chromium browser nyata; mencakup seluruh alur login → detail → save → durable preview worker → lima PNG dan CTA.
- `npm run import`: **331 bab**, read-only source, SQLite app-owned.
- Private `.env` dibuat bootstrap, mode **0600** diverifikasi melalui stat saja; key tidak dicetak/dibaca dalam laporan.
- Screenshot nyata: browser-dashboard.png dan browser-dashboard-detail.png. Preview diperiksa visual: overlay asli, heading panel 1 saja, footer, CTA, label placeholder jelas.

## Batas bukti

CLI teks dan PNG live diverifikasi parent, bukan otomatis membuktikan seluruh artikel/editor/stock worker. Image job masih read-only sandbox; parent spike memakai workspace-write, jadi kompatibilitas full worker merupakan gate live berikutnya. Stock selector/scoring sumber, final PNG dengan gambar aktual, video karaoke/audio integrity, POST Reels/reconcile dan TTS worker belum selesai. Reels NC-WA diblokir sebelum request, sehingga uncertain-submission test tidak relevan sampai submission diimplementasikan. Tidak ada TTS live, publish live, tunnel, commit, atau scheduler.

Pemeriksaan akhir 00:15: runner teks juga menonaktifkan unified_exec, browser/computer/apps dan Code Mode host (khusus teks; host gambar tetap aktif). Focused provider **5/5 PASS**, typecheck **PASS** setelah perubahan flag. Pemeriksaan proses argv memastikan tidak ada worker aplikasi tersisa; port 8072 bebas. Key private tidak dicetak.
