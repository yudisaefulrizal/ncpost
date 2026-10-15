import { describe, expect, it } from "vitest";
import {
  STAFF,
  latestJobs,
  newlyCompleted,
  staffStatus,
  type OfficeJob,
} from "../src/client/kantor-status";

const staff = (id: string) => STAFF.find((s) => s.id === id)!;
const job = (
  id: number,
  kind: string,
  state: string,
  chapter_id = 1,
): OfficeJob => ({
  id,
  chapter_id,
  kind,
  state,
});

describe("status karyawan kantor", () => {
  it("bekerja saat job menunya berjalan", () => {
    expect(
      staffStatus(staff("gvideo"), [job(2, "VIDEO_KALIMAT", "running")]),
    ).toBe("bekerja");
    expect(
      staffStatus(staff("audio"), [job(2, "VIDEO_KALIMAT", "running")]),
    ).toBe("diam");
  });

  it("gagal hanya bila job terbaru untuk bagian dan jenis itu gagal", () => {
    const retried = [
      job(5, "TTS_KALIMAT", "completed"),
      job(3, "TTS_KALIMAT", "failed"),
    ];
    expect(staffStatus(staff("audio"), retried)).toBe("diam");
    expect(staffStatus(staff("audio"), [job(3, "TTS_KALIMAT", "failed")])).toBe(
      "gagal",
    );
  });

  it("bekerja didahulukan dari gagal dan menunggu", () => {
    const jobs = [
      job(9, "POST_IG", "queued", 1),
      job(8, "REELS_IG", "failed", 2),
      job(7, "POST_TIKTOK", "running", 3),
    ];
    expect(staffStatus(staff("sosmed"), jobs)).toBe("bekerja");
  });

  it("menunggu saat hanya ada job antre", () => {
    expect(staffStatus(staff("gpanel"), [job(1, "PANEL", "queued")])).toBe(
      "menunggu",
    );
  });

  it("selesai sebentar setelah job rampung, lalu kembali diam", () => {
    const jobs = [job(1, "PANEL", "completed")];
    expect(staffStatus(staff("gpanel"), jobs, 5000, 1000)).toBe("selesai");
    expect(staffStatus(staff("gpanel"), jobs, 5000, 6000)).toBe("diam");
  });

  it("koordinator antrean memantau semua jenis job", () => {
    expect(staffStatus(staff("antrean"), [job(1, "ARTICLE", "failed")])).toBe(
      "gagal",
    );
  });

  it("gambar stok dan gambar quote dipegang karyawan berbeda", () => {
    expect(
      staffStatus(staff("foto"), [job(1, "S_IMAGE_LAB_3_H", "running")]),
    ).toBe("bekerja");
    expect(staffStatus(staff("foto"), [job(1, "QUOTE_LAB_3", "running")])).toBe(
      "diam",
    );
    expect(
      staffStatus(staff("ggambar"), [job(1, "QUOTE_LAB_3", "running")]),
    ).toBe("bekerja");
  });

  it("latestJobs menyisakan satu job per bagian dan jenis", () => {
    const out = latestJobs([
      job(1, "PANEL", "failed"),
      job(4, "PANEL", "running"),
      job(2, "PANEL", "queued", 2),
    ]);
    expect(out.map((j) => j.id)).toEqual([4, 2]);
  });

  it("newlyCompleted hanya job yang tadinya aktif", () => {
    const prev = new Map([
      [1, "running"],
      [2, "completed"],
      [3, "queued"],
    ]);
    const now = [
      job(1, "PANEL", "completed"),
      job(2, "PANEL", "completed"),
      job(3, "PANEL", "failed"),
    ];
    expect(newlyCompleted(prev, now).map((j) => j.id)).toEqual([1]);
  });
});

describe("pembagian menu dan job", () => {
  it("gambar tunggal dipegang gudang gambar, bukan admin sosmed", () => {
    expect(
      staffStatus(staff("ggambar"), [job(1, "POST_IMAGE", "running")]),
    ).toBe("bekerja");
    expect(
      staffStatus(staff("sosmed"), [job(1, "POST_IMAGE", "running")]),
    ).toBe("diam");
    expect(staffStatus(staff("sosmed"), [job(1, "REELS_IG", "running")])).toBe(
      "bekerja",
    );
  });
  it("setiap karyawan kecuali resepsionis punya menu", () => {
    expect(STAFF.filter((s) => !s.menu).map((s) => s.id)).toEqual([
      "resepsionis",
    ]);
  });
});
