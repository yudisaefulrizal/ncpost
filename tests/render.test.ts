import { it, expect } from "vitest";
import sharp from "sharp";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderPanel, pickTemplate, fits } from "../src/server/render";
import { templates } from "../src/server/templates";
it("preview asli 1080x1350; vertikal tanpa stok ditolak, overflow ditolak", async () => {
  const b = await renderPanel(
    "1",
    1,
    "Kebiasaan kecil",
    "Mulai dengan langkah kecil yang bisa diulangi.",
    "Buku - Bagian 1",
  );
  expect(await sharp(b).metadata()).toMatchObject({
    width: 1080,
    height: 1350,
  });
  await expect(renderPanel("4", 1, "Judul", "Isi", "Buku")).rejects.toThrow(
    /portrait/,
  );
  await expect(
    renderPanel("6", 1, "Judul panjang ".repeat(20), "Isi ".repeat(40), "Buku"),
  ).rejects.toThrow(/Overflow/);
});
it("stok ditempel di jendela template, vertikal boleh dengan stok portrait", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "panel-"));
  const red = path.join(dir, "red.png");
  writeFileSync(
    red,
    await sharp({
      create: { width: 1920, height: 1080, channels: 3, background: "#ff0000" },
    })
      .png()
      .toBuffer(),
  );
  const t = templates.find((x) => x.id === "1")!;
  const out = await renderPanel(
    "1",
    2,
    "",
    "Isi paragraf.",
    "Buku - Bagian 2",
    red,
  );
  const [x1, y1, x2, y2] = t.window;
  const { data } = await sharp(out)
    .extract({
      left: Math.round((x1 + x2) / 2),
      top: Math.round((y1 + y2) / 2),
      width: 1,
      height: 1,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect([data[0], data[1], data[2]]).toEqual([255, 0, 0]);
  const v = await renderPanel("4", 3, "", "Isi.", "Buku", red);
  expect((await sharp(v).metadata()).height).toBe(1350);
});
it("pilih template acak yang muat; tanpa stok portrait tidak pernah vertikal", () => {
  for (let i = 0; i < 30; i++)
    expect(pickTemplate("", "Isi pendek.", false).vertical).toBe(false);
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++)
    seen.add(pickTemplate("", "Isi pendek.", true).id);
  expect(seen).toEqual(new Set(["1", "2", "4", "4B", "6"]));
  const long = "kata ".repeat(60);
  expect(fits(templates.find((x) => x.id === "6")!, "", long)).toBe(false);
  expect(() => pickTemplate("Judul ".repeat(40), long, true)).toThrow(
    /Overflow/,
  );
});
it("tanpa sumber horizontal hanya template vertikal 4/4B", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++)
    seen.add(pickTemplate("", "Isi pendek.", true, false).id);
  expect(seen).toEqual(new Set(["4", "4B"]));
  expect(() => pickTemplate("", "Isi.", false, false)).toThrow(/Overflow/);
});
