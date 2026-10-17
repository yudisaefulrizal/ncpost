import { expect, it } from "vitest";
import {
  AMBIENCE,
  ambienceAt,
  ambienceName,
  wibHour,
} from "../src/client/ambience";

it("jam WIB dihitung dari epoch", () => {
  expect(wibHour(Date.UTC(2026, 9, 17, 0, 30))).toBeCloseTo(7.5);
  expect(wibHour(Date.UTC(2026, 9, 17, 20, 0))).toBeCloseTo(3);
});

it("nama suasana mengikuti jam WIB", () => {
  expect(ambienceName(6)).toBe("pagi");
  expect(ambienceName(12)).toBe("siang");
  expect(ambienceName(16.5)).toBe("sore");
  expect(ambienceName(20)).toBe("malam");
  expect(ambienceName(2)).toBe("malam");
});

it("otomatis: puncak suasana tepat, peralihan dicampur halus", () => {
  expect(ambienceAt("otomatis", 8)).toEqual(AMBIENCE.pagi);
  expect(ambienceAt("otomatis", 12)).toEqual(AMBIENCE.siang);
  expect(ambienceAt("otomatis", 17)).toEqual(AMBIENCE.sore);
  expect(ambienceAt("otomatis", 23)).toEqual(AMBIENCE.malam);
  // 18.25 = setengah jalan sore → malam.
  const dusk = ambienceAt("otomatis", 18.25);
  expect(dusk.lamps).toBeCloseTo(
    (AMBIENCE.sore.lamps + AMBIENCE.malam.lamps) / 2,
  );
  expect(dusk.sunIntensity).toBeLessThan(AMBIENCE.sore.sunIntensity);
  expect(dusk.sunIntensity).toBeGreaterThan(AMBIENCE.malam.sunIntensity);
  expect(dusk.background).toMatch(/^#[0-9a-f]{6}$/);
});

it("pilihan manual mengabaikan jam", () => {
  expect(ambienceAt("malam", 12)).toEqual(AMBIENCE.malam);
  expect(ambienceAt("pagi", 23)).toEqual(AMBIENCE.pagi);
});
