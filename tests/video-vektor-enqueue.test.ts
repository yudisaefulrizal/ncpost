import { afterEach, describe, expect, it, vi } from "vitest";
import type mysql from "mysql2/promise";
import { Store, type Chapter, type Job } from "../src/server/store";
import { ContentTypeStore, withContentType } from "../src/server/content-types";
import {
  normalizeContentType,
  type ContentType,
} from "../src/server/content-type-domain";
import { videoVektorType } from "../src/server/video-vektor-type";
import { cronJobs } from "../src/server/cron";
import { verifyVideoVektorQueue } from "../src/server/video-vektor-queue-check";

const vector: ContentType = { id: 10, ...videoVektorType() };
const ordinary = (mode?: "anim2d"): ContentType => ({
  id: 11,
  ...normalizeContentType({
    name: "Video biasa",
    engine: "book",
    outputs: ["VIDEO_KALIMAT_H"],
    ...(mode
      ? {
          settings: {
            sentenceVideoHMode: mode,
            sentenceVideoHKind: "IMAGE_HORIZONTAL",
          },
        }
      : {}),
  }),
});
afterEach(() => vi.restoreAllMocks());

function fixture(type: ContentType = vector, patch: Partial<Chapter> = {}) {
  const chapter = {
    id: 101,
    content_type_id: type.id,
    book: type.name,
    title: "jenjang karir tertinggi seorang developer itu adalah bertani",
    revision: 0,
    article: "",
    article_status: "belum",
    sentence_audio: null,
    sentence_video: null,
    sentence_video_h: null,
    ...patch,
  } as Chapter;
  const jobs: Job[] = [];
  const query = vi.fn(async (sql: string, params: any[] = []) => {
    if (sql.startsWith("SELECT id FROM content_types"))
      return [[{ id: type.id }]];
    if (sql.startsWith("INSERT INTO chapters"))
      return [{ insertId: chapter.id }];
    if (sql.startsWith("SELECT kind,state,revision,force_new FROM jobs"))
      return [[jobs.find((j) => j.id === params[0])]];
    if (sql.startsWith("INSERT INTO jobs")) {
      const job = {
        id: 71,
        chapter_id: params[0],
        kind: params[1],
        state: "queued",
        revision: params[2],
        force_new: params[3],
        attempts: 0,
        lease: 0,
        error: null,
      } as Job;
      jobs.push(job);
      return [{ insertId: job.id }];
    }
    if (sql.includes("FROM jobs WHERE state IN ('queued','running')"))
      return [jobs.map((j) => ({ ...j }))];
    if (sql.startsWith("UPDATE jobs SET state='running'")) {
      const j = jobs.find((j) => j.id === params[1])!;
      j.state = "running";
      j.attempts++;
      j.lease = params[0];
      return [{ affectedRows: 1 }];
    }
    throw Error(`Unexpected database operation: ${sql}`);
  });
  const connection = {
    query,
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
  const pool = { query, getConnection: vi.fn(async () => connection) };
  // Only database lookups are stubbed; enqueue, its validation, transaction and claim run unchanged.
  const store = Object.create(Store.prototype) as Store;
  store.db = pool as unknown as mysql.Pool;
  vi.spyOn(store, "chapter").mockResolvedValue(chapter);
  vi.spyOn(store, "bookSettings").mockResolvedValue(type.settings!);
  const stock = vi.spyOn(store, "stock").mockResolvedValue([]);
  vi.spyOn(ContentTypeStore.prototype, "get").mockResolvedValue(type);
  return { store, chapter, jobs, query, pool, connection, stock };
}

describe("Video Vektor through ncpost's real enqueue and claim", () => {
  it("accepts a title with no source images, article or sentence audio and lets the worker claim it", async () => {
    const f = fixture();
    await expect(
      f.store.enqueue(f.chapter.id, "VIDEO_KALIMAT_H"),
    ).resolves.toBe(71);
    expect(f.jobs).toEqual([
      expect.objectContaining({
        chapter_id: 101,
        kind: "VIDEO_KALIMAT_H",
        revision: 0,
        force_new: 0,
        state: "queued",
      }),
    ]);
    expect(f.stock).not.toHaveBeenCalled();
    expect(f.connection.commit).toHaveBeenCalledOnce();
    await expect(f.store.claim()).resolves.toMatchObject({
      id: 71,
      kind: "VIDEO_KALIMAT_H",
      state: "running",
      attempts: 1,
    });
  });
  it("uses the same enqueue path for scheduled jobs without taking over the scheduler transaction", async () => {
    const f = fixture();
    const [kind] = cronJobs("VIDEO_KALIMAT_H", f.chapter, vector.settings!);
    await withContentType(vector, () =>
      f.store.enqueue(
        f.chapter.id,
        kind,
        false,
        f.connection as unknown as mysql.PoolConnection,
      ),
    );
    expect(f.jobs[0]).toMatchObject({ kind: "VIDEO_KALIMAT_H", force_new: 0 });
    expect(f.pool.getConnection).not.toHaveBeenCalled();
    expect(f.connection.commit).not.toHaveBeenCalled();
  });
  it("preserves explicit regeneration and the database duplicate-job guard", async () => {
    const f = fixture();
    await expect(
      f.store.enqueue(f.chapter.id, "VIDEO_KALIMAT_H", true),
    ).resolves.toBe(71);
    expect(f.jobs[0].force_new).toBe(1);
    f.query.mockRejectedValueOnce(
      Object.assign(Error("Duplicate"), { code: "ER_DUP_ENTRY" }),
    );
    await expect(
      f.store.enqueue(f.chapter.id, "VIDEO_KALIMAT_H"),
    ).rejects.toThrow("Job aktif sudah ada");
    expect(f.connection.rollback).toHaveBeenCalledOnce();
  });
  it.each(["ARTICLE", "TTS_KALIMAT", "VIDEO_KALIMAT"])(
    "still rejects an unrelated %s stage for Video Vektor",
    async (kind) => {
      const f = fixture();
      await expect(f.store.enqueue(f.chapter.id, kind)).rejects.toThrow(
        "Tahap tidak digunakan",
      );
      expect(f.jobs).toHaveLength(0);
    },
  );
});

describe("existing video prerequisites", () => {
  it("still requires image-source settings for an ordinary horizontal video", async () => {
    const type = ordinary();
    type.settings = { ...type.settings!, sentenceVideoHKind: null };
    const f = fixture(type);
    await expect(
      f.store.enqueue(f.chapter.id, "VIDEO_KALIMAT_H"),
    ).rejects.toThrow("Pilih sumber gambar Video Kalimat H");
  });
  it("still requires sentence audio for an ordinary horizontal video", async () => {
    const f = fixture(ordinary());
    await expect(
      f.store.enqueue(f.chapter.id, "VIDEO_KALIMAT_H"),
    ).rejects.toThrow("audio per kalimat");
  });
  it("still requires approved text for ncpost's existing 2D animation", async () => {
    const f = fixture(ordinary("anim2d"));
    await expect(
      f.store.enqueue(f.chapter.id, "VIDEO_KALIMAT_H"),
    ).rejects.toThrow("Video animasi 2D butuh artikel lolos editor");
  });
});

describe("database deployment verification", () => {
  it("rolls back its temporary chapter and job after successful native enqueue", async () => {
    const f = fixture();
    await expect(verifyVideoVektorQueue(f.store)).resolves.toBe(true);
    expect(f.connection.beginTransaction).toHaveBeenCalledOnce();
    expect(f.connection.rollback).toHaveBeenCalledOnce();
    expect(f.connection.commit).not.toHaveBeenCalled();
    expect(f.connection.release).toHaveBeenCalledOnce();
  });
  it("rolls back and releases the connection when enqueue fails", async () => {
    const f = fixture(),
      normal = f.query.getMockImplementation()!;
    f.query.mockImplementation(async (sql, params) => {
      if (sql.startsWith("INSERT INTO jobs"))
        throw Error("Database verification failed");
      return normal(sql, params);
    });
    await expect(verifyVideoVektorQueue(f.store)).rejects.toThrow(
      "Database verification failed",
    );
    expect(f.connection.rollback).toHaveBeenCalledOnce();
    expect(f.connection.commit).not.toHaveBeenCalled();
    expect(f.connection.release).toHaveBeenCalledOnce();
  });
});
