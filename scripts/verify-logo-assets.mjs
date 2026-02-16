import fs from "node:fs";
import path from "node:path";

const requiredFiles = [
  "assets/images/app-icon.png",
  "assets/images/master-logo.png",
  "assets/images/horizontal-logo.png",
];

const rootDir = process.cwd();
let hasError = false;

for (const relativeFile of requiredFiles) {
  const absoluteFile = path.join(rootDir, relativeFile);
  if (!fs.existsSync(absoluteFile)) {
    console.error(`[verify-logo-assets] Missing required file: ${relativeFile}`);
    hasError = true;
  } else {
    console.log(`[verify-logo-assets] OK: ${relativeFile}`);
  }
}

if (hasError) {
  process.exit(1);
}

console.log("[verify-logo-assets] All required logo assets exist with expected casing.");

