// Halaman Kantor: setiap menu diwakili satu karyawan. Status karyawan dibaca
// dari job terbaru per (bagian, jenis) yang menjadi urusan menunya.
export type OfficeStatus =
  | "diam"
  | "bekerja"
  | "menunggu"
  | "selesai"
  | "gagal";
export type OfficeJob = {
  id: number;
  chapter_id: number;
  kind: string;
  state: string;
  error?: string | null;
  title?: string;
};
export type Staff = {
  id: string;
  nama: string;
  dept: "konten" | "manajer" | "aset" | "rnd" | "umum" | "lobi";
  menu: string | null;
  tugas: string;
  handles?: (kind: string) => boolean;
  semua?: boolean;
};

/** Job semu dari Lab Berita: satu per lab, chapter_id = -id lab. */
export const JURNALIS_KIND = "JURNALIS";
export type OfficeLab = {
  id: number;
  theme: string;
  state: "idle" | "running" | "failed";
  error: string | null;
  lastRunAt: number | null;
};
export const labJobs = (labs: OfficeLab[]): OfficeJob[] =>
  labs
    .filter((l) => l.state !== "idle" || l.lastRunAt)
    .map((l) => ({
      // id negatif berubah tiap putaran agar "selesai" terdeteksi sekali.
      id: -((l.lastRunAt ?? 0) * 1000 + l.id),
      chapter_id: -l.id,
      kind: JURNALIS_KIND,
      state:
        l.state === "running"
          ? "running"
          : l.state === "failed"
            ? "failed"
            : "completed",
      error: l.error,
      title: l.theme,
    }));
const among =
  (...kinds: string[]) =>
  (k: string) =>
    kinds.includes(k);
const isStockImage = (k: string) =>
  /^(S_)?IMAGE_/.test(k) && !/^QUOTE_/.test(k);

export const STAFF: Staff[] = [
  {
    id: "manajer",
    nama: "Manajer Produksi",
    dept: "manajer",
    menu: "Ruang Manajer",
    tugas: "Memberi target posting harian per sosmed dan memantau capaian tim.",
  },
  {
    id: "produksi",
    nama: "Tim Produksi",
    dept: "konten",
    menu: "Kreat Konten",
    tugas: "Menulis artikel, meninjau, dan menyiapkan pratinjau.",
    handles: among("ARTICLE", "EDITOR", "PREVIEW", "QUOTE"),
  },
  {
    id: "art",
    nama: "Art Director",
    dept: "konten",
    menu: "Pengaturan Konten",
    tugas: "Menentukan output, gaya gambar, dan aturan konten tiap sosmed.",
  },
  {
    id: "shift",
    nama: "Penjadwal Shift",
    dept: "konten",
    menu: "Jadwal",
    tugas: "Mengatur kapan pekerjaan otomatis dan posting berjalan.",
  },
  {
    id: "antrean",
    nama: "Koordinator Antrean",
    dept: "konten",
    menu: "List Antrian",
    tugas: "Memantau seluruh antrean pekerjaan.",
    semua: true,
  },
  {
    id: "sekretaris",
    nama: "Sekretaris Jadwal",
    dept: "konten",
    menu: "List Jadwal",
    tugas: "Memegang kalender semua jadwal posting.",
  },
  {
    id: "sosmed",
    nama: "Admin Sosmed",
    dept: "konten",
    menu: "Pusat Sosmed",
    tugas:
      "Memegang semua akun dan memposting sesuai aturan konten tiap sosmed.",
    handles: among("POST_IG", "REELS_IG", "POST_YOUTUBE", "POST_TIKTOK"),
  },
  {
    id: "foto",
    nama: "Pustakawan Foto",
    dept: "aset",
    menu: "Stok Gambar",
    tugas: "Membuat dan menyimpan stok gambar.",
    handles: isStockImage,
  },
  {
    id: "audio",
    nama: "Pustakawan Audio",
    dept: "aset",
    menu: "Stok Audio",
    tugas: "Membuat narasi suara per kalimat.",
    handles: among("TTS_KALIMAT"),
  },
  {
    id: "casting",
    nama: "Casting Director",
    dept: "aset",
    menu: "Daftar Suara",
    tugas: "Memilih pengisi suara.",
  },
  {
    id: "ggambar",
    nama: "Staf Gudang Gambar",
    dept: "aset",
    menu: "Stok Konten Gambar",
    tugas: "Membuat dan menyimpan gambar quote dan gambar tunggal.",
    handles: (k) =>
      k === "QUOTE_IMAGE" || k === "POST_IMAGE" || /^QUOTE_LAB_/.test(k),
  },
  {
    id: "gpanel",
    nama: "Staf Gudang Panel",
    dept: "aset",
    menu: "Stok Konten Panel",
    tugas: "Menyusun dan menyimpan panel.",
    handles: among("PANEL", "IMAGES_PANEL"),
  },
  {
    id: "gvideo",
    nama: "Staf Gudang Video",
    dept: "aset",
    menu: "Stok Konten Video",
    tugas: "Merender dan menyimpan video.",
    handles: among("VIDEO_KALIMAT", "VIDEO_KALIMAT_H", "IMAGES_VIDEO"),
  },
  {
    id: "naskah",
    nama: "Peneliti Naskah",
    dept: "rnd",
    menu: "Lab Prompt Artikel",
    tugas: "Menguji prompt artikel.",
  },
  {
    id: "jurnalis",
    nama: "Jurnalis",
    dept: "rnd",
    menu: "Lab Berita",
    tugas:
      "Mencari berita dari sumber rujukan tiap Lab Berita sampai target harian.",
    handles: among(JURNALIS_KIND),
  },
  {
    id: "visual",
    nama: "Peneliti Visual",
    dept: "rnd",
    menu: "Lab Prompt Gambar",
    tugas: "Menguji prompt gambar.",
  },
  {
    id: "kunci",
    nama: "Pemegang Kunci",
    dept: "umum",
    menu: "Kredensial",
    tugas: "Menyimpan akses API dan akun.",
  },
  {
    id: "admin",
    nama: "Admin / HRD",
    dept: "umum",
    menu: "Pengaturan",
    tugas: "Mengurus pengaturan umum.",
  },
  {
    id: "resepsionis",
    nama: "Resepsionis",
    dept: "lobi",
    menu: null,
    tugas: "Menyambut tamu dan menunjukkan siapa mengurus apa.",
  },
];

export const DEPT_NAME: Record<Staff["dept"], string> = {
  konten: "Departemen Konten",
  manajer: "Ruang Manajer",
  aset: "Departemen Aset",
  rnd: "Departemen R&D",
  umum: "Departemen Umum",
  lobi: "Lobi",
};

export const STATUS_LABEL: Record<OfficeStatus, string> = {
  diam: "Diam",
  bekerja: "Bekerja",
  menunggu: "Menunggu",
  selesai: "Selesai",
  gagal: "Gagal",
};

/** Job terbaru per (bagian, jenis); job lama yang sudah diulang tidak dihitung. */
export function latestJobs(jobs: OfficeJob[]) {
  const seen = new Set<string>();
  return [...jobs]
    .sort((a, b) => b.id - a.id)
    .filter((j) => {
      const key = j.chapter_id + ":" + j.kind;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export const jobsOf = (s: Staff, jobs: OfficeJob[]) =>
  s.semua
    ? jobs.filter((j) => j.kind !== JURNALIS_KIND)
    : s.handles
      ? jobs.filter((j) => s.handles!(j.kind))
      : [];

export function staffStatus(
  s: Staff,
  jobs: OfficeJob[],
  doneUntil = 0,
  now = Date.now(),
): OfficeStatus {
  const mine = latestJobs(jobsOf(s, jobs));
  if (mine.some((j) => j.state === "running")) return "bekerja";
  if (mine.some((j) => j.state === "failed")) return "gagal";
  if (mine.some((j) => j.state === "queued")) return "menunggu";
  if (doneUntil > now) return "selesai";
  return "diam";
}

/** Job yang sebelumnya antre/berjalan dan kini selesai. */
export function newlyCompleted(prev: Map<number, string>, jobs: OfficeJob[]) {
  return jobs.filter(
    (j) =>
      j.state === "completed" &&
      ["queued", "running"].includes(prev.get(j.id) ?? ""),
  );
}
