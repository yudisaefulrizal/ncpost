import { spawn } from "node:child_process";
import { test, expect } from "@playwright/test";
test("auth, dashboard source, detail save dan preview, Instagram only", async ({
  page,
  request,
}) => {
  expect((await request.get("/api/chapters")).status()).toBe(401);
  expect((await request.get("/api/templates/1/1")).status()).toBe(401);
  expect((await request.get("/api/cta")).status()).toBe(401);
  expect((await request.get("/api/media/1/panel-1.png")).status()).toBe(401);
  expect(
    (
      await request.post("/api/login", {
        data: { email: "admin@gmail.com", password: "admin123" },
      })
    ).status(),
  ).toBe(403);
  await page.goto("/");
  await page.getByLabel("Email").fill("admin@gmail.com");
  await page.getByLabel("Password").fill("salah");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page.getByText("Email atau password salah")).toBeVisible();
  await page.getByLabel("Password").fill("admin123");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(
    page.getByRole("heading", { name: "Produksi", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Judul buku").fill("Rich Dad Poor Dad");
  await page.getByLabel("Judul bagian").fill("Aset dan liabilitas");
  await page.getByRole("button", { name: "Tambah bagian" }).click();
  await expect(page.getByText("Rich Dad Poor Dad").first()).toBeVisible();
  const cookies = await page.context().cookies();
  expect(cookies[0].httpOnly).toBe(true);
  expect(cookies[0].sameSite).toBe("Strict");
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  await page.screenshot({
    path: "docs/browser-dashboard.png",
    fullPage: false,
  });
  expect(await page.locator("body").innerText()).not.toMatch(
    /YouTube|TikTok|Zernio/,
  );
  await page
    .getByRole("button", { name: /^Buka bagian \d+ / })
    .first()
    .click();
  await page
    .getByLabel("Artikel (hook + lima paragraf)")
    .fill(
      "# Kebiasaan kecil\n\n## Kebiasaan kecil\nSatu langkah kecil.\n\nDua langkah kecil.\n\nTiga langkah kecil.\n\nEmpat langkah kecil.\n\nLima langkah kecil.\n\nBerdasarkan buku Rich Dad Poor Dad, Robert Kiyosaki.\n\nTag: buku, kebiasaan sehari hari",
    );
  await page.getByRole("button", { name: "Simpan draf" }).click();
  await expect(page.getByText("Draf tersimpan")).toBeVisible();
  await page.getByRole("button", { name: "Render preview" }).click();
  await expect(page.getByText("Job PREVIEW masuk antrean")).toBeVisible();
  const worker = spawn(
    process.execPath,
    ["--import", "tsx", "src/worker/main.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SESSION_SECRET: "ncpost-test-only-secret-8072",
        NCPOST_TEST: "true",
      },
      stdio: "ignore",
    },
  );
  try {
    await expect(page.getByAltText("Preview panel 1")).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole("button", { name: "Tampilkan CTA asli" }).click();
    await expect(page.getByAltText("CTA asli")).toBeVisible();
    await page.screenshot({
      path: "docs/browser-dashboard-detail.png",
      fullPage: true,
    });
  } finally {
    worker.kill("SIGTERM");
    await new Promise<void>((resolve) => worker.once("exit", () => resolve()));
  }
  await page.getByRole("button", { name: "Pengaturan", exact: true }).click();
  await expect(
    page.getByText("Reels aktif melalui NC-WA (videoUrl publik)"),
  ).toBeVisible();
});
