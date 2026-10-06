// Arrange only metadata the author wrote; an absent year remains absent.
export function parseMemoryCaption(caption = "") {
  const original = typeof caption === "string" ? caption : "",
    yearMatch = original.match(/\s*\((\d{4})\)\s*$/);
  const location = (
      yearMatch ? original.slice(0, yearMatch.index) : original
    ).trim(),
    separator = location.lastIndexOf(",");
  return {
    original,
    place: separator < 0 ? location : location.slice(0, separator).trim(),
    country: separator < 0 ? "" : location.slice(separator + 1).trim(),
    year: yearMatch?.[1] ?? "",
  };
}
