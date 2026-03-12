/**
 * Normalize course names for matching and search.
 */

function normalizeCourseName(name) {
  if (!name || typeof name !== "string") return "";

  let value = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "")
    .trim();

  const suffixes = [
    "golf club",
    "golf course",
    "golf centre",
    "golf center",
    "country club",
    "links",
    "golf",
  ];

  for (const suffix of suffixes) {
    const pattern = new RegExp(`\\s+${suffix}\\s*$`, "i");
    value = value.replace(pattern, "");
  }

  return value.replace(/\s+/g, " ").trim();
}

function tokenizeCourseName(name) {
  const normalized = normalizeCourseName(name);
  return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
}

function nameMatchesInText(haystack, courseName, minTokens = 1) {
  if (!haystack || !courseName) return false;

  const text = haystack.toLowerCase();
  const tokens = tokenizeCourseName(courseName).filter((token) => token.length >= 2);

  if (tokens.length === 0) return false;

  let matched = 0;
  for (const token of tokens) {
    if (text.includes(token)) {
      matched += 1;
    }
  }

  return matched >= Math.min(minTokens, tokens.length);
}

function nameSimilarity(a, b) {
  const aTokens = new Set(tokenizeCourseName(a));
  const bTokens = new Set(tokenizeCourseName(b));

  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let intersect = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      intersect += 1;
    }
  }

  return intersect / Math.max(aTokens.size, bTokens.size);
}

module.exports = {
  normalizeCourseName,
  tokenizeCourseName,
  nameMatchesInText,
  nameSimilarity,
};
