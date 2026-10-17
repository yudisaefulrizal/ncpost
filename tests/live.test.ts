import { afterEach, expect, it } from "vitest";
import { existsSync, rmSync } from "node:fs";
import {
  asLive,
  codexLiveText,
  live,
  liveFile,
  liveTail,
  readLive,
  withLive,
  LIVE_CHARS,
} from "../src/server/live";
import { liveByStaff, liveStaff } from "../src/client/kantor-status";

process.env.NCPOST_TEST = "true";
afterEach(() => rmSync(liveFile(), { force: true }));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

it("teks proses dirapikan menjadi satu baris dan ekor 80 karakter", () => {
  expect(liveTail("  **Menulis**\n\n artikel  ")).toBe("Menulis artikel");
  const long = "x".repeat(200) + "AKHIR";
  const tail = liveTail(long);
  expect(tail).toHaveLength(LIVE_CHARS);
  expect(tail.startsWith("…")).toBe(true);
  expect(tail.endsWith("AKHIR")).toBe(true);
});

it("hanya event Codex yang bermakna yang ditampilkan", () => {
  const event = (type: string, item: object) => JSON.stringify({ type, item });
  expect(
    codexLiveText(
      event("item.completed", {
        type: "web_search",
        action: { query: "berita AI" },
      }),
    ),
  ).toBe("Mencari: berita AI");
  expect(
    codexLiveText(
      event("item.completed", { type: "reasoning", text: "Membaca" }),
    ),
  ).toBe("Membaca");
  expect(
    codexLiveText(
      event("item.completed", { type: "agent_message", text: '{"link":"x"}' }),
    ),
  ).toBe('{"link":"x"}');
  expect(codexLiveText(event("turn.started", {}))).toBeNull();
  expect(
    codexLiveText(event("item.completed", { type: "command_execution" })),
  ).toBeNull();
  expect(codexLiveText("bukan json")).toBeNull();
});

it("proses job tercatat ke berkas selama berjalan dan hilang setelah selesai", async () => {
  live("di luar job diabaikan");
  await withLive("jobs:7", "PANEL", async () => {
    live("Menyusun panel 1");
    await asLive("JURNALIS", async () => live("Mencari berita"));
    await wait(450);
    expect(readLive()).toEqual([
      expect.objectContaining({
        key: "jobs:7",
        kind: "JURNALIS",
        text: "Mencari berita",
      }),
    ]);
  });
  await wait(450);
  expect(existsSync(liveFile())).toBe(true);
  expect(readLive()).toEqual([]);
});

it("jenis proses dipetakan ke karyawan kantor", () => {
  expect(liveStaff("ARTICLE")).toBe("produksi");
  expect(liveStaff("JURNALIS")).toBe("jurnalis");
  expect(liveStaff("LAB_ARTICLE")).toBe("naskah");
  expect(liveStaff("LAB_IMAGE")).toBe("visual");
  expect(liveStaff("VIDEO_KALIMAT")).toBe("gvideo");
  expect(liveStaff("TIDAK_DIKENAL")).toBeNull();
  expect(
    liveByStaff([
      { key: "a", kind: "ARTICLE", text: "lama", at: 1 },
      { key: "b", kind: "ARTICLE", text: "baru", at: 2 },
      { key: "c", kind: "JURNALIS", text: "cari", at: 1 },
    ]),
  ).toEqual({ produksi: "baru", jurnalis: "cari" });
});
