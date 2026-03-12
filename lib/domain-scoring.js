/**
 * Shared domain helpers for discovery scripts.
 */

const {
  normalizeCourseName,
  nameMatchesInText,
  nameSimilarity,
} = require("./normalize-course-name");

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

const PENALTY_PATTERNS = [
  /^blog\./,
  /\.blogspot\./,
  /\.wordpress\./,
  /\.tumblr\./,
  /\.weebly\./,
  /\.wixsite\./,
  /\.squarespace\./,
  /^www\d*\./,
  /-?\d{4,}/,
  /^(img|static|cdn|media|assets)\./,
];

const CLUB_KEYWORDS = ["golf", "club", "links", "course", "countryclub", "country-club"];

const SLD_PATTERNS = [
  /\.(co|org|ac|gov|sch)\.uk$/,
  /\.(com|co|org|net)\.au$/,
  /\.(co|com|org)\.nz$/,
  /\.(co|com)\.za$/,
];

function extractDomain(url) {
  if (!url || typeof url !== "string") return "";

  try {
    let value = url.trim().toLowerCase();
    if (!value.startsWith("http")) value = `https://${value}`;

    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./, "");
    const parts = host.split(".");

    if (parts.length < 2) return host;

    for (const pattern of SLD_PATTERNS) {
      if (pattern.test(host)) {
        return parts.slice(-3).join(".");
      }
    }

    return parts.slice(-2).join(".");
  } catch {
    return "";
  }
}

function checkPenalty(domain) {
  const value = domain.toLowerCase();

  if (PENALTY_DOMAINS.has(value)) {
    return { penalize: true, reason: "blacklisted" };
  }

  for (const pattern of PENALTY_PATTERNS) {
    if (pattern.test(value)) {
      return { penalize: true, reason: "low-quality-pattern" };
    }
  }

  return { penalize: false };
}

function scoreDomainCandidate({ domain, pageTitle, courseName, area }) {
  const breakdown = {
    base: 50,
    nameMatch: 0,
    domainQuality: 0,
    titleQuality: 0,
    areaMatch: 0,
    keywordBonus: 0,
    penalty: 0,
  };

  let score = 50;
  const penalty = checkPenalty(domain);

  if (penalty.penalize) {
    breakdown.penalty = -80;
    score += breakdown.penalty;
    return { score: Math.max(0, score), breakdown };
  }

  const normalizedName = normalizeCourseName(courseName);
  const domainLower = domain.toLowerCase();
  const similarity = nameSimilarity(domain.replace(/\./g, " "), normalizedName);

  if (similarity > 0.5) {
    breakdown.nameMatch = 25;
  } else if (similarity > 0.25 || nameMatchesInText(domainLower, courseName, 1)) {
    breakdown.nameMatch = 15;
  }
  score += breakdown.nameMatch;

  if (domain.length <= 20 && !/\d{4,}/.test(domain)) {
    breakdown.domainQuality = 10;
  } else if (domain.length <= 35) {
    breakdown.domainQuality = 5;
  }
  score += breakdown.domainQuality;

  const flattened = domainLower.replace(/\./g, "");
  for (const keyword of CLUB_KEYWORDS) {
    if (flattened.includes(keyword)) {
      breakdown.keywordBonus = 10;
      break;
    }
  }
  score += breakdown.keywordBonus;

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

  if (area && area.trim()) {
    const searchText = [domainLower, pageTitle || ""].join(" ");
    for (const token of area.toLowerCase().trim().split(/\s+/)) {
      if (token.length >= 3 && searchText.includes(token)) {
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
