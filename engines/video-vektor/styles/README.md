# Gaya visual

Setiap gaya adalah satu folder di sini. Nama folder adalah nama gaya, dan nama itu yang tampil di UI: huruf kecil, angka, dan tanda hubung, misalnya `vektor-kucing`. Gaya yang lengkap langsung muncul di pilihan **Gaya visual** pada UI dan bisa dipakai dengan `--style <id>`. Kode aplikasi tidak perlu diubah.

```text
styles/<id>/
├── style.md        # gambaran gaya yang dibaca agen
├── referensi/      # (opsional) bahan sumber berlisensi terbuka yang ditunjuk style.md
└── contoh/         # kode Remotion yang mewujudkan gaya itu; disalin sebagai titik awal proyek
```

## Dua hal yang berbeda: format dan gaya

**Format** sama untuk semua gaya karena dibutuhkan pipeline. Isinya ada di [`_kerangka/`](_kerangka/):

| File di `contoh/` | Kegunaan bagi pipeline |
|---|---|
| `index.ts` | titik masuk Remotion (`registerRoot`) |
| `Film.tsx` | mengekspor `Film` (gambar + audio) dan `VisualFilm` (gambar saja), keduanya membaca `timeline.json` |
| `timeline.json` | diganti pipeline dengan durasi dan timing narasi proyek |
| `Root.tsx` | ditulis ulang pipeline untuk mendaftarkan `ProjectFilm` dan `ProjectVisual` 1920x1080 |
| audio dan font | `staticFile('audio/scene-N.mp3')`, `staticFile('audio/score.wav')`, `staticFile('fonts/...')` |

**Gaya** adalah semua hal lain: `Story.tsx`, `edit.ts`, `components/`, palet, cara menggambar, dan gerak. Gaya digambarkan di `style.md`; `contoh/` berisi kerangka sampai ada video gaya itu yang layak dijadikan contoh. Gaya tidak mengambil tampilan dari gaya lain, termasuk dari `vektor-kucing`.

## Membuat gaya baru

1. Salin `_kerangka/` menjadi `styles/<id>/`. Kerangka hanya berisi format dan satu adegan kosong, tanpa tampilan gaya apa pun.
2. Tulis `style.md` sebagai **gambaran singkat karakter gaya**: rasa garis, warna, bentuk, karakter, kedalaman, dan tipografi, ditambah gerak yang digambarkan secara umum (film yang mengalir, aksi sebab-akibat, perpindahan kamera, sambungan antaradegan). Templatnya ada di `_kerangka/style.md`.
3. Biarkan `contoh/` berisi kerangka dulu. Setelah ada video gaya ini yang terasa pas, pindahkan kodenya dari `hasil/<id>/source/` menjadi `contoh/`.
4. Gambar dari luar boleh dipakai sebagai inspirasi suasana, tetapi bukan target yang harus disamai. Bahan referensi yang berlisensi terbuka (aturan, laporan, cuplikan kecil) boleh disimpan di `styles/<id>/referensi/` dengan `README.md` yang mencatat asal dan lisensinya; `style.md` menunjuknya agar agen membacanya. Gambar lukisan tidak bisa direplikasi oleh bentuk kode. Yang dibawa ke gaya adalah karakternya.

Gaya hanya tampil di UI bila `style.md` ada dan `contoh/` memiliki `index.ts` serta `Film.tsx`. Folder berawalan `_`, seperti `_kerangka`, tidak pernah tampil.

## style.md

```markdown
---
deskripsi: Stickman dan objek sederhana dengan garis spidol hitam tebal dan warna rata.
---
- Garis spidol hitam yang tebal dan ramah.
- Warna rata yang cerah.
- ...
```

Nama gaya di UI adalah **nama foldernya**. `deskripsi` (opsional) menjadi keterangan di bawah pilihan. Isi setelah frontmatter dikirim ke agen sebagai panduan gaya, bersama contoh kodenya.

Proyek menyimpan gayanya sendiri. Melanjutkan proyek tetap memakai gaya saat kodenya dibuat. Proyek yang dibuat sebelum fitur gaya ada memakai `vektor-kucing`.
