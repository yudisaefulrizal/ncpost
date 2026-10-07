# Codex CLI gambar — bukti parent

- Probe nyata melalui executable codex menghasilkan PNG yang diperiksa header, ukuran 1536×1024, hash dan visual. Detail di PARENT-PROVIDER-CHECK.md.
- Adapter baru src/server/codex-image.ts: output diambil hanya dari generated_images/<thread_id> CLI yang valid; model-provided arbitrary path diabaikan; reject symlink, PNG stale, orientasi salah dan error event; normalisasi horizontal 1920×1080 / vertikal 1080×1920 dengan crop tanpa stretch.
- RED `npm test -- tests/codex-image.test.ts`: gagal karena modul adapter belum ada.
- GREEN command sama: 4/4 passed. Fixture PNG putih hanya untuk pengujian filesystem/normalisasi, bukan stok produksi.
- Guard tool: shell/unified_exec/browser/computer/apps dinonaktifkan, image_generation aktif, Code Mode host tetap aktif. Ini pembatasan tools, BUKAN isolasi OS credential/filesystem penuh.
- Integrasi job/UI gambar perlu disambungkan ke adapter setelah builder selesai; keberhasilan standalone module tidak dianggap fitur UI selesai.
