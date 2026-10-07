import { it, expect } from "vitest";
import {
  exactKey,
  sessionToken,
  validSession,
  hashPassword,
  verifyPassword,
  allowedOrigin,
  RateLimiter,
} from "../src/server/auth";
it("clé exacte, empty/bad denied", () => {
  expect(exactKey("", "")).toBe(false);
  expect(exactKey("secret ", "secret")).toBe(false);
  expect(exactKey("secret", "secret")).toBe(true);
});
it("session signed expiring tamper denied", () => {
  const user = { uid: 1, email: "admin@gmail.com" };
  const token = sessionToken(user, "test", 1000);
  expect(validSession(token, "test", 1001)).toEqual(user);
  expect(validSession(token, "test", 1000 + 9 * 3600 * 1000)).toBeNull();
  expect(validSession(token + "x", "test", 1001)).toBeNull();
  expect(validSession(token, "lain", 1001)).toBeNull();
  expect(validSession(token, "", 1001)).toBeNull();
});
it("password di-hash scrypt bergaram, salah ditolak", () => {
  const h = hashPassword("admin123");
  expect(h).toMatch(/^scrypt\$/);
  expect(h).not.toContain("admin123");
  expect(hashPassword("admin123")).not.toBe(h);
  expect(verifyPassword("admin123", h)).toBe(true);
  expect(verifyPassword("admin124", h)).toBe(false);
  expect(verifyPassword("admin123", "rusak")).toBe(false);
});
it("CSRF origin exact", () => {
  expect(allowedOrigin("http://127.0.0.1:8072")).toBe(true);
  expect(allowedOrigin(null)).toBe(false);
  expect(allowedOrigin("https://evil.test")).toBe(false);
});
it("rate limit bounded", () => {
  const l = new RateLimiter(2, 1000);
  expect(l.take("same", 0)).toBe(true);
  expect(l.take("same", 1)).toBe(true);
  expect(l.take("same", 2)).toBe(false);
  expect(l.take("same", 1001)).toBe(true);
});
