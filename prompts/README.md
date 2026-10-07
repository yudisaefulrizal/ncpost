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
