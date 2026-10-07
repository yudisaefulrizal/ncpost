import { it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  validCredential,
  credentialStatus,
  writeEnvValue,
} from "../src/server/credentials";
it("validasi nilai", () => {
  expect(validCredential("ncig_abc123")).toBe(true);
  expect(validCredential("a b c d")).toBe(false);
  expect(validCredential("abc\nX=1")).toBe(false);
  expect(validCredential("ab")).toBe(false);
});
it("status tidak membocorkan nilai", () => {
  const s = credentialStatus({ NCWA_API_KEY: "rahasia" } as any);
  expect(JSON.stringify(s)).not.toContain("rahasia");
  expect(s.NCWA_API_KEY.set).toBe(true);
  expect(s.ELEVENLABS_API_KEY.set).toBe(false);
});
it("tulis, ganti, hapus tanpa merusak baris lain", () => {
  const f = path.join(mkdtempSync(path.join(tmpdir(), "env-")), ".env");
  writeFileSync(f, "ACCESS_KEY=x\nNCWA_API_KEY=lama\n");
  writeEnvValue(f, "NCWA_API_KEY", "baru1");
  expect(readFileSync(f, "utf8")).toBe("ACCESS_KEY=x\nNCWA_API_KEY=baru1\n");
  writeEnvValue(f, "NCWA_API_KEY", null);
  expect(readFileSync(f, "utf8")).toBe("ACCESS_KEY=x\n");
  expect(statSync(f).mode & 0o777).toBe(0o600);
});
