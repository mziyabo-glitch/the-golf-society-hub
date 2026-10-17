# Phase 1 Playwright QA automation

Isolated fixtures only (`QA Phase1 *` societies, `qa.phase1.*@gsh-qa.test` users). **Do not** point these scripts at live M4/ZGS events.

## Seed / cleanup

1. Apply `scripts/qa/seed-phase1-fixtures.sql` via Supabase SQL editor or MCP `execute_sql` (or `npm run qa:phase1:seed` when `SUPABASE_DB_URL` is set).
2. Export fixture IDs: `npm run qa:phase1:fetch-fixtures` (needs service role) **or** copy `qa_phase1_fixtures.payload` into `e2e/fixtures/phase1.json`.
3. Cleanup: `scripts/qa/cleanup-phase1-fixtures.sql` / `npm run qa:phase1:cleanup`.

Password for all QA accounts: `QaPhase1Test!2026`.

## Run

```bash
export PLAYWRIGHT_BASE_URL=https://the-golf-society-hub.vercel.app
# or a Vercel preview URL once this branch is deployed
npm run test:e2e:phase1
```

Projects: Chromium desktop + Pixel 7 mobile viewport. Failures retain screenshots, traces, and video under `test-results/`.

## Coverage matrix

See `docs/phase1-playwright-qa-matrix.md`.
