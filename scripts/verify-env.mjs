#!/usr/bin/env node

const requiredEnv = [
  {
    logicalName: "SUPABASE_URL",
    keys: ["EXPO_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
  },
  {
    logicalName: "SUPABASE_ANON_KEY",
    keys: ["EXPO_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  },
];

const placeholderFragments = [
  "your-",
  "example",
  "changeme",
];

const missing = [];
const invalid = [];

for (const entry of requiredEnv) {
  const selected = entry.keys.find((k) => {
    const value = process.env[k];
    return typeof value === "string" && value.trim().length > 0;
  });

  if (!selected) {
    missing.push(entry);
    continue;
  }

  const value = (process.env[selected] || "").trim().toLowerCase();
  if (placeholderFragments.some((frag) => value.includes(frag))) {
    invalid.push({ entry, key: selected });
  }
}

if (missing.length || invalid.length) {
  console.error("[verify-env] Missing or invalid environment variables.");

  if (missing.length) {
    console.error("[verify-env] Missing:");
    for (const entry of missing) {
      console.error(`  - ${entry.logicalName}: set one of ${entry.keys.join(" | ")}`);
    }
  }

  if (invalid.length) {
    console.error("[verify-env] Invalid placeholders:");
    for (const item of invalid) {
      console.error(`  - ${item.entry.logicalName}: ${item.key} appears to be a placeholder`);
    }
  }

  process.exit(1);
}

console.log("[verify-env] Required Supabase env vars are present.");
