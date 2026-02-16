#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const distIndexPath = path.resolve("dist/index.html");

if (!fs.existsSync(distIndexPath)) {
  console.error(`[postbuild-web] Missing file: ${distIndexPath}`);
  process.exit(1);
}

let html = fs.readFileSync(distIndexPath, "utf8");

const injectedBlock = [
  '    <meta name="theme-color" content="#0E1A2B" />',
  '    <meta name="apple-mobile-web-app-capable" content="yes" />',
  '    <meta name="apple-mobile-web-app-status-bar-style" content="default" />',
  '    <link rel="icon" type="image/x-icon" href="/favicon-v2.ico" />',
  '    <link rel="apple-touch-icon" href="/apple-touch-icon-v2.png" />',
  '    <link rel="manifest" href="/manifest-v2.json" />',
].join("\n");

// Remove prior managed block if present.
html = html.replace(
  /\s*<!-- gsh-web-icons:start -->[\s\S]*?<!-- gsh-web-icons:end -->\s*/g,
  "\n"
);

// Remove any default Expo favicon references if present.
html = html.replace(/<link rel="icon"[^>]*>/g, "");

if (!html.includes("</head>")) {
  console.error("[postbuild-web] Could not find </head> in dist/index.html");
  process.exit(1);
}

html = html.replace(
  "</head>",
  `<!-- gsh-web-icons:start -->\n${injectedBlock}\n    <!-- gsh-web-icons:end -->\n  </head>`
);

fs.writeFileSync(distIndexPath, html);
console.log("[postbuild-web] Injected versioned icon and manifest tags into dist/index.html");
