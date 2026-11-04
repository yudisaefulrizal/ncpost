import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "video-vektor-production.spec.ts",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:8185",
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    },
  },
  webServer: {
    command: "node_modules/.bin/vite --host 127.0.0.1 --port 8185 --strictPort",
    url: "http://127.0.0.1:8185/tests/fixtures/video-vektor-production.html",
    reuseExistingServer: false,
  },
});
