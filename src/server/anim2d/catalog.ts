// Katalog Video Animasi 2D (port Nus 2D Studio): template komposisi, makna
// prop, dan pilihan yang boleh dipakai naskah. Dipakai mesin gambar dan prompt.
//
// Posisi slot: [u, v, ukuran] dalam kotak panggung (u 0-1 kiri→kanan, v 0-1
// atas→garis tanah). Ukuran = kotak gambar relatif sisi terpendek panggung
// (S .2, M .28, L .4, XL .5; landscape x1.25). ground: dasar benda menempel
// di tanah. w = lebar maksimum teks [portrait, landscape] relatif lebar
// panggung. Area kanan-bawah setiap template dikosongkan untuk Nus.
export type SlotPos = [number, number, string?];
export interface Slot {
  kinds: string[];
  pt: SlotPos;
  ls: SlotPos;
  w?: [number, number];
  ground?: boolean;
}
export interface Comp {
  desc: string;
  slots: Record<string, Slot>;
}
const VIS = ["prop", "icon", "counter", "bars", "badge"];
const NOTE = ["note", "text"];
const LABEL = ["text", "badge"];
export const COMP_SIZES: Record<string, number> = {
  S: 0.2,
  M: 0.28,
  L: 0.4,
  XL: 0.5,
};
export const COMP_LS_SCALE = 1.25;
export const COMPS: Record<string, Comp> = {
  headline: {
    desc: "Pembuka/judul: kartu note di atas, satu benda utama di tengah, dua pendamping kecil di kiri-kanan, satu benda di tanah.",
    slots: {
      note: {
        kinds: ["note"],
        pt: [0.5, 0.11],
        ls: [0.5, 0.12],
        w: [0.92, 0.6],
      },
      hero: { kinds: VIS, pt: [0.5, 0.5, "L"], ls: [0.5, 0.55, "L"] },
      left: { kinds: VIS, pt: [0.15, 0.48, "S"], ls: [0.24, 0.55, "M"] },
      right: { kinds: VIS, pt: [0.85, 0.48, "S"], ls: [0.76, 0.55, "M"] },
      ground: {
        kinds: ["prop"],
        pt: [0.5, 1, "M"],
        ls: [0.5, 1, "S"],
        ground: true,
      },
    },
  },
  hero: {
    desc: "Fokus tunggal: satu benda besar menjelaskan kalimat, dua aksen kecil di atas, satu label di bawah.",
    slots: {
      hero: { kinds: VIS, pt: [0.5, 0.46, "XL"], ls: [0.5, 0.48, "XL"] },
      tl: { kinds: VIS, pt: [0.16, 0.14, "S"], ls: [0.2, 0.22, "M"] },
      tr: { kinds: VIS, pt: [0.84, 0.14, "S"], ls: [0.8, 0.22, "M"] },
      label: { kinds: LABEL, pt: [0.5, 0.88], ls: [0.5, 0.9], w: [0.6, 0.4] },
    },
  },
  versus: {
    desc: "Perbandingan dua hal: kiri vs kanan dengan penghubung kecil di tengah, label di bawah masing-masing, judul opsional di atas.",
    slots: {
      top: { kinds: NOTE, pt: [0.5, 0.1], ls: [0.5, 0.1], w: [0.92, 0.6] },
      left: { kinds: VIS, pt: [0.24, 0.46, "L"], ls: [0.3, 0.5, "L"] },
      mid: {
        kinds: ["prop", "icon", "text"],
        pt: [0.5, 0.46, "S"],
        ls: [0.5, 0.5, "S"],
        w: [0.2, 0.14],
      },
      right: { kinds: VIS, pt: [0.76, 0.46, "L"], ls: [0.7, 0.5, "L"] },
      labelL: {
        kinds: LABEL,
        pt: [0.24, 0.76],
        ls: [0.3, 0.86],
        w: [0.3, 0.3],
      },
      labelR: { kinds: LABEL, pt: [0.7, 0.76], ls: [0.7, 0.86], w: [0.3, 0.3] },
    },
  },
  row: {
    desc: "Daftar tiga hal setara berjajar, label di bawah masing-masing, judul opsional di atas. Tambahkan links bila urutan/proses.",
    slots: {
      top: { kinds: NOTE, pt: [0.5, 0.12], ls: [0.5, 0.12], w: [0.92, 0.6] },
      a: { kinds: VIS, pt: [0.18, 0.4, "M"], ls: [0.22, 0.48, "M"] },
      b: { kinds: VIS, pt: [0.5, 0.4, "M"], ls: [0.48, 0.48, "M"] },
      c: { kinds: VIS, pt: [0.82, 0.4, "M"], ls: [0.74, 0.48, "M"] },
      la: { kinds: LABEL, pt: [0.18, 0.63], ls: [0.22, 0.8], w: [0.3, 0.22] },
      lb: { kinds: LABEL, pt: [0.5, 0.63], ls: [0.48, 0.8], w: [0.3, 0.22] },
      lc: { kinds: LABEL, pt: [0.82, 0.63], ls: [0.74, 0.8], w: [0.3, 0.22] },
    },
  },
  stat: {
    desc: "Angka kunci: counter besar di atas, ilustrasi konteks di bawahnya, label penjelas, satu pembanding kecil di samping.",
    slots: {
      number: {
        kinds: ["counter"],
        pt: [0.5, 0.18, "L"],
        ls: [0.5, 0.23, "L"],
      },
      hero: { kinds: VIS, pt: [0.5, 0.58, "L"], ls: [0.5, 0.63, "L"] },
      side: { kinds: VIS, pt: [0.84, 0.46, "S"], ls: [0.76, 0.55, "M"] },
      label: { kinds: LABEL, pt: [0.5, 0.92], ls: [0.5, 0.94], w: [0.6, 0.4] },
    },
  },
  scene: {
    desc: "Adegan dunia nyata: benda di langit (helikopter, awan, matahari), benda berdiri di tanah (api, rumah, pohon), dan satu info di tengah.",
    slots: {
      sky: {
        kinds: ["prop", "icon"],
        pt: [0.62, 0.17, "L"],
        ls: [0.62, 0.2, "L"],
      },
      skyL: {
        kinds: ["prop", "icon", "badge"],
        pt: [0.2, 0.2, "M"],
        ls: [0.22, 0.22, "M"],
      },
      mid: {
        kinds: ["counter", "bubble", "badge", "text", "prop", "icon"],
        pt: [0.5, 0.5, "M"],
        ls: [0.5, 0.5, "M"],
        w: [0.8, 0.4],
      },
      g1: {
        kinds: ["prop"],
        pt: [0.32, 1, "M"],
        ls: [0.22, 1, "M"],
        ground: true,
      },
      g2: {
        kinds: ["prop"],
        pt: [0.53, 1, "M"],
        ls: [0.46, 1, "M"],
        ground: true,
      },
      g3: {
        kinds: ["prop"],
        pt: [0.74, 1, "M"],
        ls: [0.7, 1, "M"],
        ground: true,
      },
    },
  },
  chat: {
    desc: "Seseorang/lembaga berkata sesuatu: pembicara (badge atau prop person) dengan gelembung ucapan, dan satu benda yang dibicarakan.",
    slots: {
      speaker: {
        kinds: ["badge", "prop", "icon"],
        pt: [0.32, 0.56, "L"],
        ls: [0.3, 0.6, "L"],
      },
      bubble: { kinds: ["bubble"], pt: [0.6, 0.24], ls: [0.6, 0.24] },
      thing: { kinds: VIS, pt: [0.72, 0.56, "M"], ls: [0.7, 0.62, "M"] },
    },
  },
  chart: {
    desc: "Tren/perbandingan banyak nilai: grafik batang besar, judul di atas, satu benda konteks kecil.",
    slots: {
      top: { kinds: NOTE, pt: [0.5, 0.1], ls: [0.5, 0.1], w: [0.92, 0.6] },
      chart: { kinds: ["bars"], pt: [0.5, 0.54, "XL"], ls: [0.46, 0.56, "XL"] },
      side: { kinds: VIS, pt: [0.84, 0.3, "S"], ls: [0.8, 0.35, "M"] },
    },
  },
};

// Makna prop dan tempatnya: ground = berdiri di tanah, sky = terbang, any = bebas.
export const PROP_INFO: Record<string, [string, "ground" | "sky" | "any"]> = {
  person: ["satu orang: warga, pekerja, tokoh umum", "any"],
  people: ["kelompok orang: masyarakat, publik, peserta", "any"],
  building: ["gedung, kantor, instansi, lembaga", "any"],
  city: ["kota, kawasan perkotaan, daerah", "any"],
  house: ["rumah, permukiman, rumah tangga", "ground"],
  server: ["server, pusat data, komputasi, infrastruktur digital", "any"],
  tree: ["pohon, hutan, lingkungan hijau", "ground"],
  sun: ["matahari, panas, siang, kemarau", "sky"],
  earth: ["bumi, dunia, skala global", "any"],
  laptop: ["laptop, kerja digital, aplikasi, data di layar", "any"],
  phone: ["ponsel, aplikasi, media sosial", "any"],
  coin: ["koin, biaya kecil, harga", "any"],
  gear: ["mesin, sistem, proses teknis, operasional", "any"],
  bulb: ["ide, gagasan, inovasi", "any"],
  rocket: ["peluncuran, pertumbuhan pesat, startup", "any"],
  chart: [
    "ikon grafik naik: pertumbuhan, statistik (bukan data spesifik)",
    "any",
  ],
  flag: ["negara, target, tonggak pencapaian", "any"],
  factory: ["pabrik, industri, produksi", "ground"],
  tower: ["menara sinyal, telekomunikasi, jaringan internet", "ground"],
  shield: ["keamanan, perlindungan, jaminan", "any"],
  book: ["pendidikan, buku, pengetahuan", "any"],
  magnifier: ["menyelidiki, mencari, menganalisis", "any"],
  heart: ["kesehatan, kepedulian, kesukaan", "any"],
  scale: ["keadilan, hukum, menimbang dua hal", "any"],
  calendar: [
    "tanggal/hari tertentu; v = angka tanggal, v2 = nama hari/bulan singkat",
    "any",
  ],
  money: ["uang tunai, anggaran, dana besar", "any"],
  helicopter: ["helikopter", "sky"],
  bucket: ["ember, air yang diangkut", "any"],
  fire: ["api, kebakaran", "ground"],
  drop: ["air, tetesan, cairan", "any"],
  raincloud: ["awan hujan, hujan, cuaca", "sky"],
  document: [
    "dokumen, surat, aturan tertulis, laporan; v = judul kecil",
    "any",
  ],
  lock: ["terkunci, dibatasi, keamanan data", "any"],
  clock: ["waktu, durasi, jam", "any"],
  megaphone: ["pengumuman, kampanye, promosi", "any"],
  trophy: ["prestasi, juara, penghargaan", "any"],
  truck: ["truk, logistik, pengiriman", "ground"],
  plane: ["pesawat, penerbangan, perjalanan", "sky"],
  camera: ["kamera, foto, rekaman", "any"],
  lunchbox: ["kotak makan, makanan, bekal, program makan", "any"],
  memo: ["catatan, daftar tugas", "any"],
};
export const PROP_NAMES = Object.keys(PROP_INFO);
export const WORLDS = ["city", "tech", "nature", "ocean", "space", "lab"];
export const MOODS = ["happy", "excited", "surprised", "thinking", "serious"];
export const NUS_POSES = [
  "idle",
  "wave",
  "think",
  "cheer",
  "shrug",
  "surprised",
  "cross",
];
export const ANIMS = [
  "pop",
  "slideL",
  "slideR",
  "slideU",
  "slideD",
  "grow",
  "fade",
];
export const LOOPS = ["none", "float", "spin", "pulse", "wiggle", "sway"];
export const ITEM_KINDS = [
  "prop",
  "icon",
  "counter",
  "bars",
  "note",
  "text",
  "badge",
  "bubble",
];
export const COLORS = [
  "a",
  "b",
  "c",
  "fg",
  "bg",
  "paper",
  "white",
  "sun",
  "skin",
  "yellow",
  "orange",
  "red",
  "blue",
  "green",
  "brown",
  "slate",
  "slateDark",
  "black",
];
// Benda yang berdiri di tanah; di slot melayang diberi lingkaran latar.
export const GROUND_ONLY = [
  "fire",
  "tree",
  "house",
  "factory",
  "truck",
  "tower",
];

export function compCatalogText() {
  return Object.entries(COMPS)
    .map(
      ([name, c]) =>
        `- "${name}": ${c.desc}\n  slot: ${Object.entries(c.slots)
          .map(
            ([s, d]) =>
              `${s}${d.ground ? "[tanah]" : ""} (${d.kinds.join("/")})`,
          )
          .join(", ")}`,
    )
    .join("\n");
}
export function propCatalogText() {
  return Object.entries(PROP_INFO)
    .map(
      ([n, [d, place]]) =>
        `- ${n}: ${d}${place === "ground" ? " [benda tanah]" : place === "sky" ? " [benda langit]" : ""}`,
    )
    .join("\n");
}
