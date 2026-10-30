/**
 * @deprecated Run `npm run course-import:e2e` (Vitest + vitest.e2e.config.ts) instead.
 * This entry was kept as a pointer; tsx cannot bundle the Expo Supabase graph in plain Node.
 */
console.error(
  "[course-import-e2e] Use: npm run course-import:e2e\n" +
    "  (runs lib/e2e/courseImport.e2e.ts via Vitest with SSR externals for react-native).",
);
process.exit(1);
