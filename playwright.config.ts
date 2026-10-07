import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  use: { screenshot: "off", baseURL: "http://127.0.0.1:8072" },
  workers: 1,
  webServer: {
    command: "npx tsx src/server/http.ts",
    url: "http://127.0.0.1:8072",
    reuseExistingServer: false,
    env: {
      SESSION_SECRET: "ncpost-test-only-secret-8072",
      NCPOST_TEST: "true",
      NCWA_API_KEY: "",
      LIVE_TTS: "false",
    },
  },
});
