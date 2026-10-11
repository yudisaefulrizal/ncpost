import { expect, it } from "vitest";
import { socialCaption } from "../src/server/social-caption";
it("uses only explicit tags, deduplicates them, and omits title, paragraphs and source", () => {
  expect(
    socialCaption(
      "# Title\n\n## Heading\n\nFirst paragraph.\n\nSecond.\n\nSumber: Book\n\nTag: #Science, Science, daily life",
    ),
  ).toBe("#science #dailylife");
});
it("uses the first paragraph without headings when no usable tag is present", () => {
  for (const tail of ["", "\n\nTag: ", "\n\nTag: #"])
    expect(
      socialCaption(
        "# Title\n\n## Heading\n\n**First paragraph.**\n\nSecond." + tail,
      ),
    ).toBe("First paragraph.");
});
it("supports single paragraph quote content", () => {
  expect(socialCaption("A short quote.")).toBe("A short quote.");
});
it("limits captions to 2200 Unicode characters", () => {
  expect([
    ...socialCaption("# Title\n\n## Heading\n\n" + "😀".repeat(2300)),
  ]).toHaveLength(2200);
});
