import { describe, expect, it } from "vitest";
import { executeBatch } from "../src/client/production-batch";

describe("production batch", () => {
  it("continues after failure, skips ineligible items, and reports each failure", async () => {
    const called: number[] = [];
    const result = await executeBatch(
      [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      {
        id: "ARTICLE",
        label: "Artikel",
        prepare: (item) => {
          if (item.id === 2) return null;
          return async () => {
            called.push(item.id);
            if (item.id === 3) throw new Error("Job aktif");
          };
        },
      },
    );
    expect(called).toEqual([1, 3, 4]);
    expect(result).toEqual({
      succeeded: 2,
      skipped: 1,
      failed: [{ id: 3, error: "Job aktif" }],
    });
  });
  it("handles eligibility errors without preventing other items", async () => {
    const result = await executeBatch([{ id: 1 }, { id: 2 }], {
      id: "PANEL",
      label: "Carousel",
      prepare: (item) => {
        if (item.id === 1) throw new Error("Konfigurasi tidak tersedia");
        return async () => {};
      },
    });
    expect(result.succeeded).toBe(1);
    expect(result.failed).toEqual([
      { id: 1, error: "Konfigurasi tidak tersedia" },
    ]);
  });
});
