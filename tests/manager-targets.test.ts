import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  activeTargets,
  managerTargets,
  normalizeTargetMap,
  saveTargets,
} from "../src/server/manager-targets";
import {
  DEFAULT_BOOK_SETTINGS,
  normalizeBookSettings,
} from "../src/server/book-settings";

const tmp = () =>
  path.join(mkdtempSync(path.join(tmpdir(), "target-")), "targets.json");

describe("target Manajer", () => {
  it("per jenis konten, angka bulat 0–50", () => {
    expect(normalizeTargetMap({ 1: { instagram: 3, tiktok: 2 } })).toEqual({
      1: { instagram: 3, youtube: 0, tiktok: 2 },
    });
    for (const bad of [-1, 2.5, 51, "3"])
      expect(() => normalizeTargetMap({ 1: { instagram: bad } })).toThrow();
    expect(() => normalizeTargetMap({ abc: {} })).toThrow();
    expect(() => normalizeTargetMap([])).toThrow();
  });

  it("sosmed yang nonaktif di Rencana konten sosmed tidak punya target", () => {
    const map = { 1: { instagram: 3, tiktok: 2, youtube: 4 } };
    const settings = normalizeBookSettings({
      ...DEFAULT_BOOK_SETTINGS,
      socialTargets: ["instagram", "tiktok"],
    });
    expect(activeTargets(map, { id: 1, settings })).toEqual({
      instagram: 3,
      youtube: 0,
      tiktok: 2,
    });
    expect(activeTargets(map, { id: 2, settings })).toEqual({
      instagram: 0,
      youtube: 0,
      tiktok: 0,
    });
  });

  it("pengaturan konten tidak lagi menyimpan target", () => {
    const s: any = normalizeBookSettings({
      ...DEFAULT_BOOK_SETTINGS,
      postTargets: { instagram: 3 },
    });
    expect(s.postTargets).toBeUndefined();
  });

  it("target lama di pengaturan dipindahkan sekali ke file Manajer, DB tidak diubah", async () => {
    const file = tmp();
    const queries: string[] = [];
    const db: any = {
      async query(sql: string) {
        queries.push(sql);
        return [
          [
            {
              id: 1,
              settings: JSON.stringify({ postTargets: { instagram: 2 } }),
            },
            { id: 2, settings: JSON.stringify({}) },
            { id: 3, settings: "{rusak" },
          ],
        ];
      },
    };
    expect(await managerTargets(db, file)).toEqual({
      1: { instagram: 2, youtube: 0, tiktok: 0 },
    });
    expect(queries.every((q) => q.startsWith("SELECT"))).toBe(true);
    // Setelah file ada, DB tidak dibaca lagi dan isi file yang dipakai.
    saveTargets({ 1: { tiktok: 5 } }, file);
    expect(await managerTargets(db, file)).toEqual({
      1: { instagram: 0, youtube: 0, tiktok: 5 },
    });
    expect(queries).toHaveLength(1);
    expect(JSON.parse(readFileSync(file, "utf8"))[1].tiktok).toBe(5);
  });
});
