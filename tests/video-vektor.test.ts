import { afterEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  contentStages,
  contentAllows,
  normalizeContentType,
  contentTypeUpdate,
} from "../src/server/content-type-domain";
import { nextBookJob } from "../src/server/content-plan";
import { cronJobs } from "../src/server/cron";
import {
  videoVektorType,
  ensureVideoVektorType,
} from "../src/server/video-vektor-type";
import {
  buildVideoVektor,
  vectorRequest,
  vectorLock,
  VECTOR_FILES,
  probeVector,
} from "../src/server/video-vektor";
import { chapterDir } from "../src/server/output-paths";
import type { Chapter, Job } from "../src/server/store";

const dirs: string[] = [];
const chapter = {
  id: 901234567,
  content_type_id: 81234,
  title: "Judul video yang sama",
  book: "Video Vektor",
  part_number: 1,
  revision: 2,
  article: "",
  article_status: "belum",
  sentence_video_h: null,
} as Chapter;
const job = {
  id: 71,
  chapter_id: chapter.id,
  revision: 2,
  kind: "VIDEO_KALIMAT_H",
  force_new: 0,
} as Job;
const temp = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ncpost-vector-test-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  rmSync(chapterDir(chapter), { recursive: true, force: true });
});

describe("Video Vektor content contract", () => {
  it("has one fixed output and no ncpost article, audio, stock or editor prerequisite", () => {
    const type = { id: 10, ...videoVektorType() };
    expect(type.settings).toMatchObject({
      pipeline: "video-vektor",
      managed: true,
      youtubeMedia: "h",
      stockKinds: [],
      sentenceKinds: [],
      panelHorizontal: null,
      sentenceVideoHKind: null,
    });
    expect([...contentStages(type)]).toEqual(["VIDEO_KALIMAT_H"]);
    for (const k of [
      "ARTICLE",
      "EDITOR",
      "PREVIEW",
      "TTS_KALIMAT",
      "IMAGES_VIDEO",
      "VIDEO_KALIMAT",
      "PANEL",
      "S_IMAGE_VERTICAL",
      "REELS_IG",
    ])
      expect(contentAllows(type, k)).toBe(false);
    expect(cronJobs("VIDEO_KALIMAT_H", chapter, type.settings)).toEqual([
      "VIDEO_KALIMAT_H",
    ]);
    expect(cronJobs("ARTICLE", chapter, type.settings)).toEqual([]);
    expect(nextBookJob(type, chapter, type.settings, [])).toBe(
      "VIDEO_KALIMAT_H",
    );
    expect(
      nextBookJob(type, chapter, type.settings, [
        { kind: "VIDEO_KALIMAT_H", state: "running" },
      ]),
    ).toBeNull();
    expect(
      nextBookJob(type, chapter, type.settings, [
        { kind: "VIDEO_KALIMAT_H", state: "cancelled" },
      ]),
    ).toBeNull();
    expect(
      cronJobs(
        "VIDEO_KALIMAT_H",
        { ...chapter, sentence_video_h: "{}" },
        type.settings,
      ),
    ).toEqual([]);
  });
  it("rejects alternate sizes/engines and removes unrelated article/voice/style controls", () => {
    for (const outputs of [["VIDEO_KALIMAT"], ["VIDEO_KALIMAT_H", "PANEL"]])
      expect(() =>
        normalizeContentType({ ...videoVektorType(), outputs }),
      ).toThrow("1920×1080");
    expect(() =>
      normalizeContentType({ ...videoVektorType(), engine: "news" }),
    ).toThrow("1920×1080");
    const value = normalizeContentType({
      ...videoVektorType(),
      settings: {
        ...videoVektorType().settings,
        audioVoiceId: 99,
        stockKinds: ["IMAGE_VERTICAL"],
        articleConfig: { source: "lab" },
      },
    });
    expect(value.settings.audioVoiceId).toBeNull();
    expect(value.settings.articleConfig).toBeUndefined();
    expect(value.settings.stockKinds).toEqual([]);
    expect(
      contentTypeUpdate(
        { name: "Nama baru", engine: "book", outputs: ["VIDEO_KALIMAT_H"] },
        { id: 10, ...value },
      ).settings.pipeline,
    ).toBe("video-vektor");
  });
  it("creates its preset idempotently without modifying existing named content", async () => {
    const calls: any[] = [];
    await ensureVideoVektorType({
      query: async (...args: any[]) => {
        calls.push(args);
        return [];
      },
    });
    expect(calls[0][0]).toContain("WHERE NOT EXISTS");
    expect(calls[0][1][0]).toBe("Video Vektor");
    expect(JSON.parse(calls[0][1][3]).pipeline).toBe("video-vektor");
  });
});

describe("Video Vektor pipeline adapter", () => {
  it("uses stable chapter/revision IDs, resumes without regeneration, and keeps titles as arguments", () => {
    const first = vectorRequest(chapter, job, "/engine");
    expect(first.id).not.toBe(
      vectorRequest({ ...chapter, id: chapter.id + 1 }, job, "/engine").id,
    );
    expect(first.args).toEqual([
      "/engine/scripts/video.mjs",
      "--title",
      chapter.title,
      "--id",
      first.id,
      "--timeout",
      "0",
    ]);
    expect(vectorRequest(chapter, { ...job, id: 72 }, "/engine").id).toBe(
      first.id,
    );
    expect(
      vectorRequest(chapter, { ...job, force_new: 1 }, "/engine").args.slice(
        -3,
      ),
    ).toEqual(["--regenerate", "--replan", "--force"]);
  });
  it("serializes productions and lets cancelled waiters exit without releasing another job's lock", async () => {
    const root = temp(),
      release = await vectorLock(root);
    const controller = new AbortController();
    const waiting = vectorLock(root, controller.signal);
    controller.abort();
    await expect(waiting).rejects.toThrow();
    expect(
      existsSync(path.join(root, ".cache/video-pipeline/ncpost.lock")),
    ).toBe(true);
    release();
    const again = await vectorLock(root);
    again();
  });
  it("runs the CLI and copies all six final files without changing video bytes", async () => {
    const root = temp(),
      fixture = path.join(root, "fixture.mp4");
    await exec("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=1920x1080:r=30",
      "-frames:v",
      "2",
      "-c:v",
      "libx264",
      "-threads",
      "1",
      "-pix_fmt",
      "yuv420p",
      fixture,
    ]);
    mkdirSync(path.join(root, "scripts"));
    mkdirSync(path.join(root, "node_modules/remotion"), { recursive: true });
    writeFileSync(path.join(root, "node_modules/remotion/package.json"), "{}");
    writeFileSync(
      path.join(root, "scripts/video.mjs"),
      `import fs from 'node:fs'; import path from 'node:path';
const args=process.argv.slice(2), id=args[args.indexOf('--id')+1];
const out=path.join(process.cwd(),'hasil',id); fs.mkdirSync(out,{recursive:true});
for(const name of ${JSON.stringify(VECTOR_FILES)}) fs.writeFileSync(path.join(out,name),name);
fs.copyFileSync(${JSON.stringify(fixture)},path.join(out,'video.mp4'));`,
    );
    const result = await buildVideoVektor(chapter, job, { root });
    expect(result).toMatchObject({
      mode: "video-vektor",
      width: 1920,
      height: 1080,
      fps: 30,
    });
    for (const name of VECTOR_FILES)
      expect(readFileSync(result.artifacts[name])).toEqual(
        readFileSync(path.join(root, "hasil", result.projectId, name)),
      );
    expect(
      existsSync(path.join(root, ".cache/video-pipeline/ncpost.lock")),
    ).toBe(false);
  }, 15000);
  it("rejects other dimensions without resizing", async () => {
    const root = temp(),
      file = path.join(root, "vertical.mp4");
    await exec("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=s=108x192:r=30",
      "-frames:v",
      "1",
      "-c:v",
      "libx264",
      "-threads",
      "1",
      "-pix_fmt",
      "yuv420p",
      file,
    ]);
    await expect(probeVector(file)).rejects.toThrow("1920×1080");
  });
  it("stops a running pipeline on ncpost cancellation and releases its lock", async () => {
    const root = temp();
    mkdirSync(path.join(root, "scripts"));
    mkdirSync(path.join(root, "node_modules/remotion"), { recursive: true });
    writeFileSync(path.join(root, "node_modules/remotion/package.json"), "{}");
    const ready = path.join(root, "ready");
    writeFileSync(
      path.join(root, "scripts/video.mjs"),
      `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(ready)},String(process.pid)); setInterval(()=>{},1000);`,
    );
    const controller = new AbortController();
    const running = buildVideoVektor(chapter, job, {
      root,
      signal: controller.signal,
    });
    const failure = expect(running).rejects.toThrow("test cancellation");
    for (let n = 0; n < 100 && !existsSync(ready); n++) await delay(20);
    expect(existsSync(ready)).toBe(true);
    const pid = Number(readFileSync(ready, "utf8"));
    controller.abort(Error("test cancellation"));
    await failure;
    expect(() => process.kill(pid, 0)).toThrow();
    expect(
      existsSync(path.join(root, ".cache/video-pipeline/ncpost.lock")),
    ).toBe(false);
  });
});

it("keeps the bundled production sources identical to the recorded snapshot", () => {
  const root = path.resolve("engines/video-vektor"),
    snapshot = JSON.parse(
      readFileSync(path.join(root, "SNAPSHOT.json"), "utf8"),
    );
  for (const [file, hash] of Object.entries(snapshot.files))
    expect(
      createHash("sha256")
        .update(readFileSync(path.join(root, file)))
        .digest("hex"),
      file,
    ).toBe(hash);
});
