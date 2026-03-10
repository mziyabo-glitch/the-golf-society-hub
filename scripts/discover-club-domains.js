#!/usr/bin/env node
/**
 * Discover likely golf club domains from DuckDuckGo HTML search results.
 *
 * Usage:
 *   node scripts/discover-club-domains.js
 *   node scripts/discover-club-domains.js --limit=50
 */

try {
  require("dotenv").config({ path: ".env" });
  require("dotenv").config({ path: ".env.local" });
} catch (_) {}

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const pLimit = require("p-limit");
const { extractDomain, checkPenalty } = require("../lib/domain-scoring");

const INPUT_PATH = path.join(__dirname, "..", "datasets", "pilot_courses.json");
const OUTPUT_PATH = path.join(__dirname, "..", "datasets", "discovered_domains.json");
const CONCURRENCY = 5;

function getArgValue(name, fallback) {
  const exact = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (exact) {
    return exact.slice(name.length + 1);
  }

  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }

  return fallback;
}

function ensureFiles() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`Missing input file: ${INPUT_PATH}`);
  }
  if (fs.existsSync(OUTPUT_PATH)) {
    throw new Error(`Refusing to overwrite existing file: ${OUTPUT_PATH}`);
  }
}

function readCourses(limit) {
  const raw = fs.readFileSync(INPUT_PATH, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("Expected datasets/pilot_courses.json to contain a JSON array");
  }

  return parsed.slice(0, limit);
}

function buildSearchUrl(courseName) {
  const query = `${courseName} golf club`;
  return `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
}

function decodeDuckDuckGoHref(href) {
  if (!href) return "";

  try {
    const url = new URL(href, "https://duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : url.toString();
  } catch {
    return href;
  }
}

function isValidResultDomain(domain) {
  if (!domain) return false;
  return !checkPenalty(domain).penalize;
}

function parseFirstValidResult(html) {
  const $ = cheerio.load(html);
  const links = $("a.result__a").toArray();

  for (const link of links) {
    const href = $(link).attr("href");
    const resolvedUrl = decodeDuckDuckGoHref(href);
    const domain = extractDomain(resolvedUrl);

    if (!isValidResultDomain(domain)) {
      continue;
    }

    return {
      domain,
      url: resolvedUrl,
    };
  }

  return null;
}

async function discoverCourse(course, index, total) {
  const courseName = course.name || "Unknown course";
  const searchUrl = buildSearchUrl(courseName);

  console.log(`[discover] ${index + 1}/${total} Searching: ${courseName}`);

  try {
    const response = await axios.get(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      },
      timeout: 15000,
    });

    const firstValid = parseFirstValidResult(response.data);

    if (!firstValid) {
      console.log(`[discover] ${index + 1}/${total} No valid domain found for ${courseName}`);
      return {
        id: course.id,
        course: courseName,
        domain: null,
      };
    }

    console.log(`[discover] ${index + 1}/${total} Found ${firstValid.domain} for ${courseName}`);

    return {
      id: course.id,
      course: courseName,
      domain: firstValid.domain,
    };
  } catch (error) {
    console.log(
      `[discover] ${index + 1}/${total} Failed for ${courseName}: ${error.message || error}`
    );
    return {
      id: course.id,
      course: courseName,
      domain: null,
    };
  }
}

function writeOutput(data) {
  const outputDir = path.dirname(OUTPUT_PATH);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), "utf8");
}

async function main() {
  const limit = Number(getArgValue("--limit", "50"));

  console.log(`[discover] Starting domain discovery with limit=${limit}`);
  ensureFiles();

  const courses = readCourses(limit);
  const limiter = pLimit(CONCURRENCY);

  const tasks = courses.map((course, index) =>
    limiter(() => discoverCourse(course, index, courses.length))
  );

  const results = await Promise.all(tasks);
  writeOutput(results);

  console.log(`[discover] Saved ${results.length} rows to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error("[discover] Failed:", error.message || error);
  process.exit(1);
});
