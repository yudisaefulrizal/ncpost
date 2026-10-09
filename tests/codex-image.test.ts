import { it, expect } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  rm,
  readFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { collectCodexImage, IMAGE_CLI_ARGS } from "../src/server/codex-image";
const thread = "01a107dc-e68b-7e72-8cc1-2901211d7f7b";
const events = (id = thread) =>
  JSON.stringify({ type: "thread.started", thread_id: id }) +
  "\n" +
  JSON.stringify({
    type: "item.completed",
    item: { type: "agent_message", text: "image done" },
  }) +
  "\n" +
  JSON.stringify({ type: "turn.completed" });
it("image CLI keeps Code Mode host and disables shell/browser tools", () => {
  expect(IMAGE_CLI_ARGS).toContain("image_generation");
  expect(IMAGE_CLI_ARGS).toContain("unified_exec");
  expect(IMAGE_CLI_ARGS).not.toContain("code_mode_host");
});
it("requires a real fresh PNG in the exact CLI thread directory and copies normalized output", async () => {
  const home = await mkdtemp(
    path.join(process.cwd(), "data/ncpost-image-test-"),
  );
  try {
    const dir = path.join(home, ".codex/generated_images", thread);
    await mkdir(dir, { recursive: true });
    const png = await sharp({
      create: { width: 48, height: 32, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await writeFile(path.join(dir, "exec-fixture.png"), png);
    const out = path.join(home, "app-stock.jpg");
    const result = await collectCodexImage(events(), {
      home,
      output: out,
      startedAt: Date.now() - 2000,
      orientation: "horizontal",
    });
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(await sharp(await readFile(out)).metadata()).toMatchObject({
      width: 1920,
      format: "jpeg",
    });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
it("does not trust a claimed output path or successful final text without real output", async () => {
  const home = await mkdtemp(
    path.join(process.cwd(), "data/ncpost-image-test-"),
  );
  try {
    await expect(
      collectCodexImage(events(), {
        home,
        output: path.join(home, "out.png"),
        startedAt: Date.now(),
        orientation: "horizontal",
      }),
    ).rejects.toThrow();
    await expect(
      collectCodexImage(events("../../etc"), {
        home,
        output: path.join(home, "out.png"),
        startedAt: Date.now(),
        orientation: "horizontal",
      }),
    ).rejects.toThrow();
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
it("rejects symlink output escapes and CLI error events even if agent claims success", async () => {
  const home = await mkdtemp(
    path.join(process.cwd(), "data/ncpost-image-test-"),
  );
  try {
    const dir = path.join(home, ".codex/generated_images", thread);
    await mkdir(dir, { recursive: true });
    const actual = path.join(home, "outside.png");
    await writeFile(
      actual,
      await sharp({
        create: { width: 32, height: 48, channels: 3, background: "white" },
      })
        .png()
        .toBuffer(),
    );
    await symlink(actual, path.join(dir, "escape.png"));
    const opts = {
      home,
      output: path.join(home, "out.png"),
      startedAt: Date.now() - 2000,
      orientation: "vertikal" as const,
    };
    await expect(collectCodexImage(events(), opts)).rejects.toThrow();
    await expect(
      collectCodexImage(
        events() +
          "\n" +
          JSON.stringify({
            type: "item.completed",
            item: { type: "error", message: "host disabled" },
          }),
        opts,
      ),
    ).rejects.toThrow();
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
it("image collection refuses wrong orientation", async () => {
  const home = await mkdtemp(path.join(process.cwd(), "data/image-test-"));
  try {
    const dir = path.join(home, ".codex/generated_images", thread);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "portrait.png"),
      await sharp({
        create: { width: 32, height: 48, channels: 3, background: "white" },
      })
        .png()
        .toBuffer(),
    );
    await expect(
      collectCodexImage(events(), {
        home,
        output: path.join(home, "out.png"),
        startedAt: Date.now() - 2000,
        orientation: "horizontal",
      }),
    ).rejects.toThrow(/Orientasi/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

it("ready-post collection produces 4:5 without cropping source text", async () => {
  const home = await mkdtemp(
    path.join(process.cwd(), "data/ncpost-image-test-"),
  );
  try {
    const dir = path.join(home, ".codex/generated_images", thread);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "fixture.png"),
      await sharp({
        create: { width: 60, height: 40, channels: 3, background: "red" },
      })
        .png()
        .toBuffer(),
    );
    const output = path.join(home, "posting.jpg");
    const result = await collectCodexImage(events(), {
      home,
      output,
      startedAt: Date.now() - 2000,
      orientation: "posting",
    });
    expect(result).toMatchObject({ width: 1080, height: 1350 });
    expect(await sharp(output).metadata()).toMatchObject({
      width: 1080,
      height: 1350,
    });
    const { data } = await sharp(output)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([...data.subarray(0, 3)].every((value) => value > 245)).toBe(true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
