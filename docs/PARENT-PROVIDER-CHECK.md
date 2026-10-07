# Hasil verifikasi provider oleh parent

## NC-WA — kontrak live read-only

URL sumber: https://ncwa.nuscode.id/api/v1/instagram/openapi.json
OpenAPI title NC-WA Instagram API, version 1.0.0.
GET /accounts tanpa credential mengembalikan HTTP 401 (akses dilindungi; bukan bukti key valid).
POST /posts memiliki required requestId, igUserId, imageUrl; caption maxLength 2200. Tidak ada videoUrl/Reels dalam schema live yang diambil pada sesi implementasi ini.
Dokumentasi source /home/nuscode/projek/- nuscode/nc-sosmed-saas/nc-wa-official/docs/instagram-api.md baris 23 eksplisit menyebut belum ada reel/story/carousel.

Keputusan: connection/account status boleh diimplementasikan; Reels submission harus disabled/block gate. Jangan POST live, jangan diam-diam mengirim image, jangan modifikasi proyek nc-wa-official tanpa perintah pengguna. Jangan menyimpulkan akun siap dari respons 401.

## Codex CLI

Observed codex-cli 0.160.0, codex login status: Logged in using ChatGPT.
Parent live text probe executed via official `codex exec --ignore-user-config --ignore-rules --ephemeral --sandbox read-only --json` and completed exit 0 with final agent_message `NCPOST_TEXT_OK`. Evidence JSONL: /tmp/ncpost-codex-text-probe.jsonl. Ini bukti teks melalui CLI berjalan, bukan bukti image tool tersedia. Probe tidak memilih model override; default akun CLI digunakan.

## Codex CLI image — live gate PASSED

Parent menjalankan CLI resmi dengan `exec --ignore-user-config --ignore-rules --ephemeral --enable image_generation --disable shell_tool --disable unified_exec --disable browser_use --disable computer_use --disable apps --sandbox workspace-write --json`. Code Mode host HARUS tetap aktif: menonaktifkan features.code_mode_host membuat tool gambar fail-closed. Tidak menggunakan API-key OpenAI, Hermes tool, Python/SVG, atau fallback.

CLI benar-benar menghasilkan `/home/nuscode/.codex/generated_images/01a107dc-e68b-7e72-8cc1-2901211d7f7b/exec-c366a270-20d7-48f8-ab7f-34166a7a6078.png`, PNG 1536×1024, 2488268 byte; SHA256 5f998d9f383419907151518141f4455f09df41280425606c30de2cc16be50483. Foto notebook+tanaman sudah diperiksa visual. JSONL `/tmp/ncpost-cli-image-probe/events-retry.jsonl` memuat thread.started dan final agent_message path; tidak ada image event terpisah dalam stream ini. Feature list menunjukkan image_generation stable true; feature list saja bukan bukti, PNG tersebut adalah bukti.

Adapter implementasi harus mengekstrak thread_id yang valid dari event, lalu mengambil PNG nyata dari direktori generated_images/<thread_id> (allowlist canonical root; validasi symlink, ukuran/dimensi/header, keluaran baru), bukan mempercayai arbitrary path/model success. Salin output ke app-owned stock, normalisasi rasio tanpa stretch. Jangan menyalin auth token; direktori gambar keluaran CLI bukan credential store.

## Deployment

Target port 8072, origin localhost 127.0.0.1, planned public ncpost.nuscode.id. User memasang tunnel nanti. Tidak ada tunnel baru dalam pekerjaan ini.
