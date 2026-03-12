import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "[build-pilot] Failed: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const PAGE_SIZE = 1000;

async function run() {
  console.log("[build-pilot] Starting export");

  let start = 0;
  let courses = [];
  let finished = false;

  while (!finished) {
    const end = start + PAGE_SIZE - 1;

    console.log(`[build-pilot] Fetching rows ${start}-${end}`);

    const { data, error } = await supabase
      .from("courses")
      .select("*")
      .range(start, end);

    if (error) {
      console.error("[build-pilot] Failed:", error.message);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      finished = true;
      break;
    }

    courses = courses.concat(data);

    if (data.length < PAGE_SIZE) {
      finished = true;
    }

    start += PAGE_SIZE;
  }

  console.log(`[build-pilot] Retrieved ${courses.length} courses`);

  const outputDir = path.join(process.cwd(), "data");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const outputFile = path.join(outputDir, "pilot-courses.json");

  fs.writeFileSync(outputFile, JSON.stringify(courses, null, 2));

  console.log("[build-pilot] Export complete");
  console.log(`[build-pilot] File written to ${outputFile}`);
}

run();