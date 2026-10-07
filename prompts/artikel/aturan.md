---
name: skill-artikel-buku-ilustrasi
description: "Menulis artikel buku berbahasa Indonesia dengan LIMA paragraf berdasarkan satu judul buku dan satu judul bab, memakai pengetahuan anda tentang buku populer tersebut secara langsung tanpa riset web. Instruksi sengaja dibuat minimal (maksimal 2 kalimat per paragraf, hanya paragraf 1 berheading, atribusi + tag di akhir) berdasarkan bukti bahwa instruksi terlalu rinci/kaku (rentang kata ketat, alokasi kasus-buku vs generalisasi wajib, pola kejadian berformat kaku) justru menurunkan kualitas tulisan dibanding membiarkan anda leluasa memakai penilaian terbaiknya. Revisi 2026-09-06: menyederhanakan drastis dari versi struktur-bebas-dengan-banyak-gate ke versi minimalis, berdasarkan perbandingan langsung hasil prompt sederhana vs skill lama pada bab yang sama (Atomic Habits, dikonfirmasi pengguna)."
---
# Skill Artikel Buku — Ilustrasi (5 paragraf, minimal)

**Input wajib:** `judul_buku` dan `judul_bab`.

**Output:** satu artikel bersih berbahasa Indonesia: judul, lima paragraf isi,
satu baris atribusi buku, dan maksimal lima tag.

## Instruksi penulisan

Buat artikel lima paragraf tentang: **[Judul Buku] — [Judul Bab]**.

- Tulis langsung dari pengetahuan anda tentang isi dan gagasan buku
  tersebut (buku-buku pada antrean adalah judul populer dan mapan). Jangan
  melakukan pencarian web atau mengutip sumber sekunder.
- Jangan mengarang detail spesifik yang tidak sejalan dengan gagasan inti
  buku (nama tokoh fiktif, statistik palsu, kutipan yang tidak diyakini
  akurat).
- **Maksimal 2 kalimat per paragraf.**
- hanya , (koma) dan . (titik) tanda baca yang boleh digunakan
- Struktur dan isi kelima paragraf sepenuhnya bebas ditentukan anda
  berdasarkan cara terbaik menjelaskan bab ini
- tak perlu menyebut buku dan penulis di paragraf
- Kalimat aktif, bahasa Indonesia natural, hindari klise ("kenapa"/"rahasia"/
  "trik" sebagai pembuka judul atau kalimat), hindari jargon akademis/
  terjemahan kaku.
- Tutup artikel dengan nilai yang jelas bagi pembaca — bukan pertanyaan baru
  yang sengaja dibiarkan tanpa jawaban.

## Format wajib (untuk kompatibilitas render panel/caption)

**Hanya paragraf 1 yang memakai heading** (`## `, identik dengan judul
utama); paragraf 2–5 langsung berupa teks tanpa heading — dipakai apa adanya
sebagai panel 1–5 oleh pipeline render (panel 1 dengan heading, panel 2–5
tanpa heading).

```markdown
# [Judul yang relevan dan tidak sensasional]

## [Judul yang relevan dan tidak sensasional]

[Paragraf 1]

[Paragraf 2]

[Paragraf 3]

[Paragraf 4]

[Paragraf 5]

Berdasarkan buku [Judul Buku], [Nama Penulis].

Tag: tag pertama, tag kedua, tag ketiga
```

- Tepat lima paragraf isi, tepat satu heading (paragraf 1).
- Baris atribusi diletakkan setelah seluruh isi, format
  `Berdasarkan buku [Judul Buku], [Nama Penulis].`
- `Tag:` diletakkan paling akhir, maksimal lima tag.
- Jangan menaruh atribusi, URL, atau tag di dalam paragraf isi.
- Judul tidak diawali "Kenapa"/"Mengapa".

## Gate kualitas wajib

Sebelum artikel dinyatakan final, validasi:

1. Tepat satu heading (paragraf 1) dan tepat lima paragraf isi; heading
   identik dengan judul utama; paragraf 2–5 tidak memiliki heading.
2. Tidak ada klaim yang mengarang detail spesifik (nama, angka, kutipan)
   yang tidak sejalan dengan gagasan inti buku.
3. Tidak ada kutipan panjang atau reproduksi teks buku.
4. Bahasa Indonesia natural, bukan terjemahan mesin.
5. Baris atribusi terpisah dari isi dan tag berada paling akhir.
6. Judul: populer, konkret, alami, bebas jargon, tidak diawali
   "Kenapa"/"Mengapa".
7. Paragraf terakhir memberi nilai/kesimpulan yang jelas, bukan pertanyaan
   menggantung.

Simpan hasil pemeriksaan ini secara ringkas bila diminta pipeline pemanggil;
jangan meneruskan artikel ke tahap gambar bila gate gagal.

## Clean output

Artikel final hanya menampilkan judul, satu heading (paragraf 1), lima
paragraf, baris atribusi, lalu tag. Jangan menampilkan proses berpikir,
rencana internal, nama skill, batas token, atau komentar teknis.
