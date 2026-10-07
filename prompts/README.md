# Prompt NC Post

Semua prompt yang dikirim ke Codex ada di sini, satu file per prompt. File dibaca ulang setiap kali dipakai, jadi hasil penyetelan langsung berlaku tanpa restart.

`{{nama}}` adalah tempat nilai yang diisi aplikasi. Jangan ubah nama placeholder. Placeholder yang salah ketik akan menggagalkan job dengan pesan yang menyebut file dan placeholder-nya.

| File | Dipakai untuk | Placeholder |
| --- | --- | --- |
| `artikel/aturan.md` | Aturan menulis artikel, disisipkan utuh ke tulis/revisi/format | — |
| `artikel/tulis.md` | Menulis artikel (▶ Artikel) | `{{buku}}`, `{{bab}}`, `{{aturan}}` |
| `artikel/review.md` | Review editor | `{{buku}}`, `{{bab}}`, `{{id_cek}}`, `{{temuan_lint}}`, `{{artikel}}` |
| `artikel/revisi.md` | Menerapkan hasil review | `{{buku}}`, `{{bab}}`, `{{laporan}}`, `{{artikel}}`, `{{aturan}}` |
| `artikel/format.md` | Perbaikan format sekali bila struktur rusak | `{{buku}}`, `{{bab}}`, `{{masalah}}`, `{{artikel}}`, `{{aturan}}` |
| `hook/hook.md` | Hook pembuka dari kelima paragraf | `{{artikel}}` |
| `quote/quote.md` | Quote dari kelima paragraf | `{{paragraf}}` |
| `quote/gambar-papercut.md` | Gambar quote gaya layered paper cut | `{{quote}}` |
| `quote/gambar-realistis.md` | Gambar quote gaya realistis | `{{quote}}` |
| `stok/realistic-horizontal.md` | Stok realistic horizontal | `{{teks}}` |
| `stok/realistic-vertikal.md` | Stok realistic vertikal | `{{teks}}` |
| `stok/minimalist-vertikal.md` | Stok minimalist vertikal | `{{teks}}` |
| `stok/papercut-vertikal.md` | Stok layered paper cut vertikal | `{{teks}}` |
| `stok/papercut-horizontal.md` | Stok layered paper cut horizontal | `{{teks}}` |
| `gambar/pembungkus-codex.md` | Pembungkus setiap prompt gambar untuk tool image_generation Codex | `{{prompt}}` |
| `editor/*.json` | Lexicon lint editor (kata dihindari, istilah asing dipertahankan) | — |

Isi `{{teks}}` pada prompt stok:

- **Stok panel:** lajur realistic diisi `heading — paragraf`, lajur lain diisi heading panel saja.
- **Gambar per kalimat:** semua lajur diisi kalimatnya.

## Artikel berita teknologi

`berita/skill-artikel-teknologi.md` adalah salinan **byte-for-byte** dari
`../ncpost-pipline-2026/artepak/artepak-skill/skill-artikel-teknologi/SKILL.md`.
SHA-256 saat diimpor: `532f30e102d536923a53efeaea747ef98a6aa41835ff3817343eba4dd81afca0`.
File dikirim utuh ke Codex dengan live web search, tanpa interpolasi,
pemangkasan, prefix, atau suffix. Instruksi sumber yang masih menyebut enam
bagian pada rencana artikel juga dipertahankan. Sesuai permintaan format
ncpost, `berita/format.md` menggantikan ketentuan heading melalui instruksi
runtime terpisah: judul teks biasa, empat paragraf tanpa header, Sumber, lalu
Tag. Gaya bahasa, urutan gagasan, dan riset dari sumber tetap berlaku.

`berita/output.schema.json` hanya mengatur pengiriman hasil sebagai objek
terstruktur: artikel bersih, tiga kandidat, rencana artikel, peta klaim, dan
sebelas pemeriksaan. Aplikasi menyimpan field tersebut sebagai artefak JSON
di `output/berita/<id>/<percobaan>/`, bukan meminta model menulis ke filesystem.
Pemeriksaan panjang teks dan sumber dijalankan kembali oleh aplikasi;
penilaian faktual/substantif tetap berasal dari model yang melakukan riset.

Instruksi runtime terpisah (`developer_instructions`) menjelaskan bahwa host
menyimpan field audit sebagai berkas, karena sesi Codex read-only. Prompt
Hermes tetap dikirim byte-for-byte. Host tetap memeriksa format dan panjang
artikel; instruksi runtime tidak mengizinkan pemeriksaan fakta dilewati.
