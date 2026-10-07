import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const origin = "http://127.0.0.1:8072";
const credentials = {
  email: process.env.NCPOST_EMAIL || "admin@gmail.com",
  password: process.env.NCPOST_PASSWORD || "admin123",
};
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const login = await context.request.post(origin + "/api/login", {
    headers: { Origin: origin },
    data: credentials,
  });
  assert.equal(login.status(), 200);
  const page = await context.newPage();
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  await page.goto(origin);
  await page.getByRole("heading", { name: "Ruang kerja konten" }).waitFor();
  // Bab diinput manual; paginasi diuji hanya bila ada lebih dari satu halaman.
  const next = page.getByRole("button", { name: "Berikutnya", exact: true });
  if (await next.isEnabled()) {
    await next.click();
    await page.getByRole("button", { name: "Sebelumnya", exact: true }).click();
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  mkdirSync("docs/qa", { recursive: true });
  await page.screenshot({ path: "docs/qa/live-dashboard.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "docs/qa/live-mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.equal(failures.length, 0, JSON.stringify(failures));
  console.log(
    "LIVE BROWSER PASS: authenticated production dashboard, desktop/mobile no page overflow, no uncaught JS errors",
  );
  await context.close();
} finally {
  await browser.close();
}
