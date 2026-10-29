import { expect, it } from "vitest";
import { publicationStatus } from "../src/server/publication-status";
it.each(["unknown", "UNKNOWN", undefined, null, ""])(
  "counts uncertain result %s as published",
  (value) => {
    expect(publicationStatus(value)).toBe("published");
  },
);
it.each(["processing", "published", "failed"])(
  "preserves explicit %s result",
  (value) => {
    expect(publicationStatus(value)).toBe(value);
  },
);
