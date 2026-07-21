# Phase 1 preview QA — automation matrix

Target: `PLAYWRIGHT_BASE_URL` (default production web: `https://the-golf-society-hub.vercel.app`) with isolated `QA Phase1 *` fixtures only.

## Tests Cursor completed automatically (Playwright)

| Scenario | Spec | Notes |
|----------|------|-------|
| Platform-admin usage report access | `e2e/phase1-access.spec.ts` | Chromium + mobile |
| Ordinary-member usage report rejection | `e2e/phase1-access.spec.ts` | |
| M4 ManCo tee-sheet access | `e2e/phase1-access.spec.ts` | QA M4 society event |
| ZGS ManCo tee-sheet access | `e2e/phase1-access.spec.ts` | QA ZGS society event |
| Cross-society event access rejection | `e2e/phase1-access.spec.ts` | Asserts no other-society leak; Access Restricted after deep-link fix deploys |
| Standard-event paid-player pool | `e2e/phase1-pools.spec.ts` | Paid in; unpaid/late excluded |
| Joint M4/ZGS player pool | `e2e/phase1-pools.spec.ts` | |
| Dual-member deduplication | `e2e/phase1-pools.spec.ts` | Bounded name mentions |
| Late-paid player refresh | `e2e/phase1-pools.spec.ts` | Via `mark_event_paid` RPC + reload |
| Save Draft | `e2e/phase1-lifecycle.spec.ts` | |
| Leave and reopen | `e2e/phase1-lifecycle.spec.ts` | |
| Publish / Update Published Tee Sheet | `e2e/phase1-lifecycle.spec.ts` | |
| Nearest-to-pin persistence | `e2e/phase1-lifecycle.spec.ts` | DB + UI labels |
| Longest-drive persistence | `e2e/phase1-lifecycle.spec.ts` | |
| Attendee CSV export | `e2e/phase1-exports.spec.ts` | Download + row contents |
| Shared tee-sheet view | `e2e/phase1-exports.spec.ts` | Payload route |
| PNG/PDF generation checks | `e2e/phase1-exports.spec.ts` | File download when available; else poster DOM; republish version string |

Run artifacts: `test-results/phase1-playwright-results.json`, `playwright-report/`, failure screenshots/traces under `test-results/artifacts/`.

## Tests requiring an Android device

| Scenario | Why not automated here |
|----------|------------------------|
| Native Android tee-sheet editor layout / touch targets | Needs Play/internal APK on a physical or emulator Android device |
| Android share sheet for PNG | System share UI outside Chromium |
| PWA “Add to Home screen” install flow on Android Chrome | Device/OEM specific |

## Tests requiring an iOS device

| Scenario | Why not automated here |
|----------|------------------------|
| Native iOS tee-sheet editor layout / Safe Area | Needs iOS Simulator or device |
| iOS share sheet / Files save for PNG/PDF | System UI |
| Safari PWA install / standalone chrome | Device-only |

## Tests requiring human visual judgement

| Scenario | Why |
|----------|-----|
| Joint branding / logo composition on poster | Aesthetic correctness |
| Print layout of PDF (margins, page breaks) | Visual print QA |
| Colour contrast / dark-mode readability | Design review |
| “Feels right” spacing on small phones beyond Pixel 7 CSS viewport | Device chrome differs from Playwright viewport |

## Safety

- Fixtures use only `QA Phase1 *` societies and `qa.phase1.*@gsh-qa.test` users.
- Live M4 Fairway / Zambezi Golf Society events are **not** modified by seed, cleanup, or these tests.
- Do **not** merge PR #175 from this workstream (already merged historically); this PR is Playwright QA only.
