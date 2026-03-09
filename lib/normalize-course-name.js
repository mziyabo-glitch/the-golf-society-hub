/**
 * Normalize course names for matching and search.
 * Used by domain discovery and scoring.
 */

/**
 * Normalize a course name for fuzzy matching.
 * - Lowercase
 * - Remove common suffixes (Golf Club, Golf Course, etc.)
 * - Collapse whitespace
 * - Remove punctuation
 * @param {string} name - Raw course name
 * @returns {string} Normalized name
 */
function normalizeCourseName(name) {
  if (!name || typeof name !== "string") return "";
  let s = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "") // remove punctuation except hyphen
    .trim();
  // Remove common suffixes for matching
  const suffixes = [
    "golf club",
    "golf course",
    "golf centre",
    "golf center",
    "country club",
    "links",
    "golf",
  ];
  for (const suf of suffixes) {
    const re = new RegExp(`\\s+${suf}\\s*$`, "i");
    s = s.replace(re, "");
  }
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Extract tokens from a normalized name for keyword matching.
 * @param {string} name - Normalized course name
 * @returns {string[]} Tokens (words)
 */
function tokenizeCourseName(name) {
  const n = normalizeCourseName(name);
  return n ? n.split(/\s+/).filter(Boolean) : [];
}

/**
 * Check if a string contains the course name (or significant tokens).
 * @param {string} haystack - Text to search (e.g. page title, domain)
 * @param {string} courseName - Course name
 * @param {number} minTokens - Minimum tokens that must match (default 1)
 * @returns {boolean}
 */
function nameMatchesInText(haystack, courseName, minTokens = 1) {
  if (!haystack || !courseName) return false;
  const h = haystack.toLowerCase();
  const tokens = tokenizeCourseName(courseName).filter((t) => t.length >= 2);
  if (tokens.length === 0) return false;
  let matched = 0;
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (h.includes(t)) matched++;
  }
  return matched >= Math.min(minTokens, tokens.length);
}

/**
 * Compute similarity ratio (0–1) between two strings.
 * Uses simple Jaccard-like token overlap.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function nameSimilarity(a, b) {
  const ta = new Set(tokenizeCourseName(a));
  const tb = new Set(tokenizeCourseName(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersect = 0;
  for (const t of ta) {
    if (tb.has(t)) intersect++;
  }
  return intersect / Math.max(ta.size, tb.size);
}

module.exports = {
  normalizeCourseName,
  tokenizeCourseName,
  nameMatchesInText,
  nameSimilarity,
};
