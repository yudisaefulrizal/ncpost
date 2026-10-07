import { it, expect } from "vitest";
import { paginateRows } from "../src/client/pagination";
it("queue uses bounded pages and clamps page after filtering", () => {
  const rows = Array.from({ length: 331 }, (_, i) => i + 1);
  const first = paginateRows(rows, 1);
  expect(first.items).toEqual(rows.slice(0, 20));
  expect(first.pages).toBe(Math.ceil(rows.length / 20));
  const last = paginateRows(rows, 999);
  expect(last.items).toEqual(rows.slice(320));
  expect(last.page).toBe(last.pages);
  expect(paginateRows(rows.slice(0, 3), 999)).toMatchObject({
    page: 1,
    pages: 1,
    items: [1, 2, 3],
  });
  expect(paginateRows([], 7)).toMatchObject({ page: 1, pages: 1, items: [] });
});
