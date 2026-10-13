import { expect, it } from "vitest";
import { estimatedImageProgress } from "../src/client/regenerate-button";
it("estimates fill from elapsed time and caps unfinished jobs at 95 percent", () => {
  expect(estimatedImageProgress(0, 10000)).toBe(0);
  expect(estimatedImageProgress(5000, 10000)).toBe(50);
  expect(estimatedImageProgress(10000, 10000)).toBe(95);
  expect(estimatedImageProgress(30000, 10000)).toBe(95);
});
it("has no numeric progress when no valid historical estimate is available", () => {
  expect(estimatedImageProgress(1000, null)).toBeNull();
  expect(estimatedImageProgress(1000, 0)).toBeNull();
  expect(estimatedImageProgress(-1000, 10000)).toBe(0);
});
