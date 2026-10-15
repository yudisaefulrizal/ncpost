import { describe, expect, it } from "vitest";
import {
  dueCount,
  igReady,
  POST_WINDOW,
  scheduleView,
  slotTimes,
  wibDayStart,
} from "../src/server/manager";

const day = wibDayStart(Date.UTC(2026, 9, 15, 5, 0)); // 15 Okt 2026 WIB
const at = (h: number, m = 0) => day + (h * 60 + m) * 60000;

describe("jadwal Manajer", () => {
  it("menyebar target di jendela posting dan stabil untuk seed yang sama", () => {
    const a = slotTimes(3, day, "x");
    expect(a).toEqual(slotTimes(3, day, "x"));
    expect(a).toHaveLength(3);
    for (const t of a) {
      expect(t).toBeGreaterThanOrEqual(at(0, POST_WINDOW.start - 20));
      expect(t).toBeLessThanOrEqual(at(0, POST_WINDOW.end + 20));
    }
    expect(a[0]).toBeLessThan(a[1]);
    expect(a[1]).toBeLessThan(a[2]);
  });
  it("target 0 tidak punya jadwal", () => {
    expect(slotTimes(0, day, "x")).toEqual([]);
  });
  it("jumlah yang jatuh tempo mengikuti jam", () => {
    const slots = slotTimes(4, day, "y");
    expect(dueCount(slots, at(5))).toBe(0);
    expect(dueCount(slots, at(23))).toBe(4);
  });
  it("tampilan jadwal: posting mengisi jam berurutan, gagal tidak mengisi", () => {
    const slots = [at(8), at(14), at(20)];
    const view = scheduleView(
      slots,
      [
        { at: at(8, 5), status: "terbit" },
        { at: at(14, 1), status: "gagal" },
      ],
      at(15),
    );
    expect(view.map((v) => v.status)).toEqual([
      "terbit",
      "terlewat",
      "terjadwal",
    ]);
  });
});

describe("kesiapan konten Instagram", () => {
  const base: any = {
    article_status: "siap",
    panels: "{}",
    panel_status: "tersedia",
    post_status: "belum",
    sentence_video: "v.mp4",
    reels_status: "belum",
    production_jobs: [],
  };
  it("carousel dan reels siap bila belum pernah diposting", () => {
    expect(igReady(base, "carousel")).toBe(true);
    expect(igReady(base, "reels")).toBe(true);
  });
  it("yang sudah terbit, sedang diproses, atau belum lolos editor dilewati", () => {
    expect(igReady({ ...base, post_status: "published" }, "carousel")).toBe(
      false,
    );
    expect(igReady({ ...base, reels_status: "processing" }, "reels")).toBe(
      false,
    );
    expect(
      igReady(
        { ...base, production_jobs: [{ kind: "POST_IG", state: "queued" }] },
        "carousel",
      ),
    ).toBe(false);
    expect(igReady({ ...base, article_status: "revisi" }, "reels")).toBe(false);
  });
});

describe("catatan Manajer", () => {
  it("nama tugas mudah dibaca, bukan kode job", async () => {
    const { taskFor } = await import("../src/server/manager");
    expect(taskFor("ARTICLE")).toBe("menulis artikel");
    expect(taskFor("S_IMAGE_LAB_6_V")).toBe("membuat gambar untuk video");
    expect(taskFor("IMAGE_HORIZONTAL")).toBe("membuat gambar carousel");
    expect(taskFor("VIDEO_KALIMAT")).toBe("merender video vertikal");
  });
});

describe("checklist ketersediaan", () => {
  it("menyiapkan sisa hari ini lalu target besok", async () => {
    const { availability } = await import("../src/server/manager");
    // target 3, sudah terbit 1, stok siap 4: hari ini butuh 2 (siap), besok 3 (siap 2)
    const a = availability(4, 3, 1, 0, 0);
    expect(a.today).toMatchObject({ need: 2, ready: 2, status: "siap" });
    expect(a.tomorrow).toMatchObject({ need: 3, ready: 2, status: "kurang" });
    expect(a.short).toBe(1);
  });
  it("produksi berjalan menutup kekurangan hari ini lebih dulu", async () => {
    const { availability } = await import("../src/server/manager");
    const a = availability(0, 2, 0, 0, 3);
    expect(a.today).toMatchObject({
      need: 2,
      producing: 2,
      status: "diproduksi",
    });
    expect(a.tomorrow).toMatchObject({
      need: 2,
      producing: 1,
      status: "kurang",
    });
  });
  it("semua siap", async () => {
    const { availability } = await import("../src/server/manager");
    const a = availability(10, 3, 3, 0, 0);
    expect(a.today.status).toBe("siap");
    expect(a.tomorrow.status).toBe("siap");
    expect(a.short).toBe(0);
  });
});
