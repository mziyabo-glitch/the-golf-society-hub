/**
 * Score domain candidates for golf club discovery.
 * Penalizes social media, directories, irrelevant domains.
 */

const { normalizeCourseName, nameMatchesInText, nameSimilarity } = require("./normalize-course-name");

// Domains to penalize heavily (social, directories, aggregators)
const PENALTY_DOMAINS = new Set([
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "tiktok.com",
  "pinterest.com",
  "tripadvisor.com",
  "yelp.com",
  "google.com",
  "google.co.uk",
  "bing.com",
  "yahoo.com",
  "wikipedia.org",
  "wikidata.org",
  "booking.com",
  "expedia.com",
  "golfshake.com",
  "todaysgolfer.co.uk",
  "golf-monthly.co.uk",
  "golfpass.com",
  "golfnow.com",
  "teeoff.com",
  "golfadvisor.com",
  "top100golfcourses.com",
  "1golf.eu",
  "golf-info-guide.com",
  "golfclubatlas.com",
]);

// Substrings in domain that suggest low quality
const PENALTY_PATTERNS = [
  /^blog\./,
  /\.blogspot\./,
  /\.wordpress\./,
  /\.tumblr\./,
  /\.weebly\./,
  /\.wixsite\./,
  /\.squarespace\./,
  /^www\d*\./,
  /-?\d{4,}/, // long numbers
  /^(img|static|cdn|media|assets)\./,
];

// Positive signals in domain
const CLUB_KEYWORDS = ["golf", "club", "links", "course", "countryclub", "country-club"];

// Common second-level TLDs (e.g. .co.uk, .org.uk)
const SLD_PATTERNS = [
  /\.(co|org|ac|gov|sch)\.uk$/,
  /\.(com|co|org|net)\.au$/,
  /\.(co|com|org)\.nz$/,
  /\.(co|com)\.za$/,
];

/**
 * Extract root domain from URL.
 * @param {string} url - Full URL or domain
 * @returns {string} e.g. "st-andrews.com" or "st-andrews-links-golfclub.co.uk"
 */
function extractDomain(url) {
  if (!url || typeof url !== "string") return "";
  try {
    let s = url.trim().toLowerCase();
    if (!s.startsWith("http")) s = "https://" + s;
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./, "");
    const parts = host.split(".");
    if (parts.length < 2) return host;
    for (const re of SLD_PATTERNS) {
      if (re.test(host)) {
        return parts.slice(-3).join("."); // e.g. xxx.co.uk
      }
    }
    return parts.slice(-2).join(".");
  } catch {
    return "";
  }
}

/**
 * Check if domain should be penalized.
 * @param {string} domain
 * @returns {{ penalize: boolean; reason?: string }}
 */
function checkPenalty(domain) {
  const d = domain.toLowerCase();
  if (PENALTY_DOMAINS.has(d)) {
    return { penalize: true, reason: "blacklisted" };
  }
  for (const re of PENALTY_PATTERNS) {
    if (re.test(d)) {
      return { penalize: true, reason: "low-quality-pattern" };
    }
  }
  return { penalize: false };
}

/**
 * Score a domain candidate.
 * @param {object} opts
 * @param {string} opts.domain - Candidate domain
 * @param {string} [opts.homepageUrl] - Full homepage URL
 * @param {string} [opts.pageTitle] - Page title if fetched
 * @param {string} opts.courseName - Course name
 * @param {string} [opts.area] - Course area/location
 * @returns {{ score: number; breakdown: object }}
 */
function scoreDomainCandidate({ domain, homepageUrl, pageTitle, courseName, area }) {
  const breakdown = { base: 50, nameMatch: 0, domainQuality: 0, titleQuality: 0, areaMatch: 0, keywordBonus: 0, penalty: 0 };
  let score = 50; // base

  const penalty = checkPenalty(domain);
  if (penalty.penalize) {
    breakdown.penalty = -80;
    score += breakdown.penalty;
    return { score: Math.max(0, score), breakdown };
  }

  // Name match in domain
  const normName = normalizeCourseName(courseName);
  const domainLower = domain.toLowerCase();
  const nameSim = nameSimilarity(domain.replace(/\./g, " "), normName);
  if (nameSim > 0.5) {
    breakdown.nameMatch = 25;
  } else if (nameSim > 0.25 || nameMatchesInText(domainLower, courseName, 1)) {
    breakdown.nameMatch = 15;
  } else if (nameMatchesInText(domainLower, courseName, 1)) {
    breakdown.nameMatch = 5;
  }
  score += breakdown.nameMatch;

  // Domain quality (short, clean)
  const domainLen = domain.length;
  if (domainLen <= 20 && !domain.match(/\d{4,}/)) {
    breakdown.domainQuality = 10;
  } else if (domainLen <= 35) {
    breakdown.domainQuality = 5;
  }
  score += breakdown.domainQuality;

  // Club keywords in domain
  const domainNoDots = domainLower.replace(/\./g, "");
  for (const kw of CLUB_KEYWORDS) {
    if (domainNoDots.includes(kw)) {
      breakdown.keywordBonus = 10;
      break;
    }
  }
  score += breakdown.keywordBonus;

  // Page title quality
  if (pageTitle) {
    const titleLower = pageTitle.toLowerCase();
    if (nameMatchesInText(titleLower, courseName, 2)) {
      breakdown.titleQuality = 20;
    } else if (nameMatchesInText(titleLower, courseName, 1)) {
      breakdown.titleQuality = 10;
    }
    if ((titleLower.includes("golf") || titleLower.includes("club")) && breakdown.titleQuality > 0) {
      breakdown.titleQuality += 5;
    }
    score += breakdown.titleQuality;
  }

  // Area match in domain or title
  if (area && area.trim()) {
    const areaNorm = area.toLowerCase().trim();
    const areaTokens = areaNorm.split(/\s+/).filter((t) => t.length >= 2);
    const searchText = [domainLower, pageTitle || ""].join(" ");
    for (const t of areaTokens) {
      if (t.length >= 3 && searchText.includes(t)) {
        breakdown.areaMatch = 10;
        break;
      }
    }
    score += breakdown.areaMatch;
  }

  return { score: Math.min(100, Math.max(0, score)), breakdown };
}

module.exports = {
  extractDomain,
  checkPenalty,
  scoreDomainCandidate,
  PENALTY_DOMAINS,
  CLUB_KEYWORDS,
};
