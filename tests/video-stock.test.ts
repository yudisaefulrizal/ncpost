import { afterEach, beforeEach, expect, it, vi } from "vitest";
import path from "node:path";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { configureMediaStock, sharedVideo } from "../src/server/media-stock";
import { outputRoot } from "../src/server/output-paths";
vi.mock("mysql2/promise", () => ({
  default: {
    createConnection: async () => ({
      query: async () => [[{ acquired: 1 }]],
      end: async () => {},
    }),
  },
}));
const rows = new Map<
  string,
  { prompt: unknown; metadata: unknown; file: string }
>();
beforeEach(() => {
  vi.stubEnv("NCPOST_TEST", "true");
  rows.clear();
  configureMediaStock({
    query: async (sql: string, args: any[]) => {
      if (sql.startsWith("INSERT")) {
        rows.set(args[3], {
          prompt: args[5],
          file: args[6],
          metadata: args[7] ?? rows.get(args[3])?.metadata,
        });
        return [{}];
      }
      if (sql.startsWith("SELECT prompt"))
        return [
          [...rows.entries()]
            .filter(([key]) => key === args[2])
            .map(([, row]) => row),
        ];
      if (sql.startsWith("SELECT metadata"))
        return [[...rows.values()].filter((row) => row.file === args[0])];
      throw Error("Unexpected stock query");
    },
  } as any);
});
afterEach(async () => {
  configureMediaStock(undefined);
  await rm(path.join(outputRoot(), "stock-video", "video-fixture"), {
    recursive: true,
    force: true,
  });
  await rm(path.join(outputRoot(), "video-source-test"), {
    recursive: true,
    force: true,
  });
  vi.unstubAllEnvs();
});
it("reuses video only when sources and render settings match and preserves orientation metadata", async () => {
  const dir = path.join(outputRoot(), "video-source-test");
  await mkdir(dir, { recursive: true });
  const source = path.join(dir, "source.jpg");
  await writeFile(source, "image");
  const generate = vi.fn(async (file: string) => {
    await writeFile(file, "video");
    return { mode: "image_audio", width: 1080 };
  });
  const args = {
    preset: "Video fixture",
    horizontal: false,
    text: "Narasi",
    recipe: { fps: 30 },
    sources: [source],
    generate,
  };
  const first = await sharedVideo(args);
  expect(first.file).toContain(
    "stock-video/video-fixture/vertikal/video-fixture__vertikal__narasi.mp4",
  );
  expect(await sharedVideo(args)).toEqual(first);
  expect(generate).toHaveBeenCalledOnce();
  await sharedVideo({ ...args, recipe: { fps: 60 } });
  expect(generate).toHaveBeenCalledTimes(2);
  await writeFile(source, "changed image content");
  await sharedVideo({ ...args, recipe: { fps: 60 } });
  expect(generate).toHaveBeenCalledTimes(3);
  await sharedVideo({ ...args, horizontal: true });
  expect(generate).toHaveBeenCalledTimes(4);
});
