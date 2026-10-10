import { afterEach, expect, it, vi } from "vitest";
vi.mock("../src/server/credentials", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/server/credentials")>()),
  writeEnvValue: vi.fn(),
}));
import { writeEnvValue } from "../src/server/credentials";
import {
  connectionSummaries,
  saveZernioConnection,
  zernioConnection,
} from "../src/server/zernio-connections";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("stores multiple keys privately, preserves legacy settings, and replaces a selected key", () => {
  vi.stubEnv("ZERNIO_API_KEY", "legacy-secret");
  vi.stubEnv("ZERNIO_PROFILE_ID", "66b2e19d8c3f5a7e9d0b1c2d");
  vi.stubEnv("ZERNIO_CONNECTIONS", "");
  const id = saveZernioConnection({ name: "Second", key: "second-secret" });
  expect(zernioConnection(id).key).toBe("second-secret");
  expect(zernioConnection("legacy").profileId).toBe("66b2e19d8c3f5a7e9d0b1c2d");
  expect(JSON.stringify(connectionSummaries())).not.toMatch(
    /legacy-secret|second-secret/,
  );
  saveZernioConnection({ id, key: "updated-secret" });
  expect(zernioConnection(id).key).toBe("updated-secret");
  expect(connectionSummaries()).toHaveLength(2);
  expect(writeEnvValue).toHaveBeenCalled();
});
it("rejects duplicate connections and unavailable IDs", () => {
  vi.stubEnv("ZERNIO_API_KEY", "");
  vi.stubEnv("ZERNIO_CONNECTIONS", "");
  saveZernioConnection({ name: "First", key: "same-secret" });
  expect(() =>
    saveZernioConnection({ name: "Duplicate", key: "same-secret" }),
  ).toThrow("sudah tersedia");
  expect(() => zernioConnection("missing")).toThrow("tidak tersedia");
});
