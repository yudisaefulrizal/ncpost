import { articleData } from "./content-contract";
// One caption policy for all content types and social platforms.
export function socialCaption(article: string, engine?: string) {
  const data = articleData(
    article,
    (engine === "quote" || !/\n\s*\n/.test(article.trim())) &&
      !article.trim().startsWith("#"),
  );
  const tags = [
    ...new Set(
      data.tags.map(
        (tag) =>
          "#" +
          tag
            .replace(/^#/, "")
            .toLowerCase()
            .replace(/[^\p{L}\p{N}_]/gu, ""),
      ),
    ),
  ].filter((tag) => tag.length > 1);
  const caption = tags.length
    ? tags.join(" ")
    : (data.paragraphs[0] || "")
        .replace(/[*_`]/g, "")
        .replace(/\s+/g, " ")
        .trim();
  return [...caption].slice(0, 2200).join("");
}
