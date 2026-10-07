import { it, expect } from "vitest";
import { normalizeAccounts } from "../src/server/providers";
import { IMAGE_CLI_ARGS } from "../src/server/codex-image";
it("NCWA GET accounts root-array contract is parsed without exposing extra fields", () => {
  expect(
    normalizeAccounts([
      {
        igUserId: "123",
        username: "nuscode",
        accessToken: "fixture-secret-never-return",
      },
    ]),
  ).toEqual([{ id: "123", username: "nuscode" }]);
  expect(() => normalizeAccounts({ error: "bad response" })).toThrow();
});
it("image argv only uses feature flags supported by the verified CLI probe", () => {
  expect(IMAGE_CLI_ARGS).not.toContain("apply_patch");
  expect(IMAGE_CLI_ARGS).toContain("workspace-write");
});
