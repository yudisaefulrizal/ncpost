import { expect, it, vi } from "vitest";
import {
  timingEta,
  timingStage,
  type ProcessTiming,
} from "../src/server/process-timing-domain";
import {
  recordProcessTiming,
  finishProcessTiming,
  applyTimingEta,
} from "../src/server/process-timing";
import { DEFAULT_CRON_GUIDE } from "../src/server/cron-guide-domain";
const sample = (
  id: number,
  stage: ProcessTiming["stage"] = "article",
): ProcessTiming => ({
  id,
  stage,
  source: "book",
  job_id: id,
  attempt: 1,
  kind: "ARTICLE",
  content_type_id: 1,
  title: "Topic",
  status: "completed",
  started_at: 0,
  finished_at: id * 1000,
  duration_ms: id * 60000,
});
it("maps complete production jobs and excludes publishing and ordinary panel rendering", () => {
  expect(timingStage("ARTICLE")).toBe("article");
  expect(timingStage("TTS_KALIMAT")).toBe("audio");
  expect(timingStage("IMAGE_VERTICAL")).toBe("images");
  expect(timingStage("S_IMAGE_VERTICAL")).toBe("images");
  expect(timingStage("VIDEO_KALIMAT_H")).toBe("video");
  expect(timingStage("POST_IG")).toBeNull();
  expect(timingStage("PANEL")).toBeNull();
});
it("computes P90 per stage, rounds up, excludes failures and returns no estimate for empty stages", () => {
  const rows = Array.from({ length: 20 }, (_, i) => sample(i + 1));
  rows.push(
    { ...sample(1000), status: "failed" },
    { ...sample(21, "images"), duration_ms: 61001 },
  );
  const eta = timingEta(rows);
  expect(eta.find((e) => e.stage === "article")).toMatchObject({
    samples: 20,
    minutes: 18,
    p90Ms: 18 * 60000,
  });
  expect(eta.find((e) => e.stage === "images")).toMatchObject({
    samples: 1,
    minutes: 2,
  });
  expect(eta.find((e) => e.stage === "audio")).toMatchObject({
    samples: 0,
    minutes: null,
  });
});
function memoryDb() {
  let rows: ProcessTiming[] = [],
    next = 1;
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql: string, params: any[] = []) => {
      if (sql.startsWith("INSERT IGNORE")) {
        const [
          stage,
          source,
          job_id,
          attempt,
          kind,
          content_type_id,
          title,
          status,
          started_at,
          finished_at,
          duration_ms,
        ] = params;
        if (
          !rows.some(
            (row) =>
              row.source === source &&
              row.job_id === job_id &&
              row.attempt === attempt,
          )
        )
          rows.push({
            id: next++,
            stage,
            source,
            job_id,
            attempt,
            kind,
            content_type_id,
            title,
            status,
            started_at,
            finished_at,
            duration_ms,
          });
      } else if (sql.startsWith("SELECT id FROM process_timings"))
        return [
          rows
            .filter((row) => row.stage === params[0])
            .sort((a, b) => b.finished_at - a.finished_at || b.id - a.id)
            .slice(0, 20),
        ];
      else if (sql.startsWith("DELETE"))
        rows = rows.filter(
          (row) => row.stage !== params[0] || params.slice(1).includes(row.id),
        );
      return [[]];
    }),
  };
  return {
    db: { getConnection: async () => connection } as any,
    connection,
    rows: () => rows,
  };
}
it("keeps exactly the newest 20 per category and removes the oldest automatically", async () => {
  const { db, connection, rows } = memoryDb();
  for (let i = 1; i <= 25; i++) await recordProcessTiming(db, sample(i));
  await recordProcessTiming(db, sample(26, "audio"));
  expect(
    rows()
      .filter((row) => row.stage === "article")
      .map((row) => row.job_id),
  ).toEqual(Array.from({ length: 20 }, (_, i) => i + 6));
  expect(rows().filter((row) => row.stage === "audio")).toHaveLength(1);
  expect(
    connection.query.mock.calls.find(([sql]) =>
      sql.includes("process_timing_locks"),
    )?.[0],
  ).toContain("FOR UPDATE");
  await recordProcessTiming(db, sample(25));
  expect(rows()).toHaveLength(21);
  await recordProcessTiming(db, { ...sample(27), finished_at: 1 });
  expect(rows()).toHaveLength(21);
  expect(rows().some((row) => row.job_id === 27)).toBe(false);
});
it("rolls back retention updates when insertion fails", async () => {
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql: string) => {
      if (sql.startsWith("INSERT")) throw Error("write failed");
      return [[]];
    }),
  };
  await expect(
    recordProcessTiming(
      { getConnection: async () => connection } as any,
      sample(1),
    ),
  ).rejects.toThrow("write failed");
  expect(connection.rollback).toHaveBeenCalledOnce();
  expect(connection.commit).not.toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalledOnce();
});
it("ignores cancelled or superseded attempts without adding a timing row", async () => {
  const getConnection = vi.fn();
  for (const row of [undefined, { state: "cancelled" }, { state: "running" }]) {
    const query = vi.fn(async (_sql: string, _params: unknown[]) => [
      row ? [row] : [],
    ]);
    await finishProcessTiming(
      { query, getConnection } as any,
      "book",
      { id: 1, attempts: 2 },
      "article",
      Date.now() - 2000,
      2000,
    );
    expect(query.mock.calls[0][1]).toEqual([1, 2]);
  }
  expect(getConnection).not.toHaveBeenCalled();
});
it("records elapsed execution time for the completed attempt and preserves failed outcomes", async () => {
  const memory = memoryDb();
  const db = {
    ...memory.db,
    query: vi.fn(async () => [
      [
        {
          state: "completed",
          kind: "ARTICLE",
          content_type_id: 1,
          title: "Done",
        },
      ],
    ]),
  };
  await finishProcessTiming(
    db,
    "book",
    { id: 50, attempts: 2 },
    "article",
    Date.now() - 3600000,
    1234,
  );
  expect(memory.rows()[0]).toMatchObject({
    job_id: 50,
    attempt: 2,
    duration_ms: 1234,
    status: "completed",
  });
  db.query = vi.fn(async () => [
    [{ state: "failed", kind: "ARTICLE", content_type_id: 1, title: "Failed" }],
  ]);
  await finishProcessTiming(
    db,
    "book",
    { id: 51, attempts: 1 },
    "article",
    Date.now() - 1000,
    1000,
  );
  expect(memory.rows()[1].status).toBe("failed");
  expect(
    timingEta(memory.rows()).find((row) => row.stage === "article")!.samples,
  ).toBe(1);
});
it("applies only the selected ETA to Guide, preserving other durations and windows", async () => {
  let written: any;
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql: string, params?: any[]) => {
      if (sql.startsWith("SELECT * FROM process_timings"))
        return [[{ ...sample(1, "images"), duration_ms: 121000 }]];
      if (sql.startsWith("SELECT settings"))
        return [[{ settings: JSON.stringify(DEFAULT_CRON_GUIDE) }]];
      if (sql.startsWith("INSERT INTO cron_guide"))
        written = JSON.parse(params![0]);
      return [[]];
    }),
  };
  await applyTimingEta(
    { getConnection: async () => connection } as any,
    "images",
  );
  expect(written.durations).toEqual({
    ...DEFAULT_CRON_GUIDE.durations,
    images: 3,
  });
  expect(written.production).toEqual(DEFAULT_CRON_GUIDE.production);
  expect(connection.commit).toHaveBeenCalledOnce();
  await expect(
    applyTimingEta({ getConnection: async () => connection } as any, "audio"),
  ).rejects.toThrow("Belum ada");
  expect(connection.rollback).toHaveBeenCalledOnce();
});
