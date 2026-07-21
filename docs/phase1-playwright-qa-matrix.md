## Latest automated run

- **Date:** 2026-07-21
- **Target:** `https://the-golf-society-hub.vercel.app`
- **Result:** **32 passed / 0 failed** (Chromium desktop + Pixel 7 mobile)
- **Artifacts:** `/opt/cursor/artifacts/phase1-playwright-run.log`, `phase1-playwright-results.json`, `phase1-playwright-report/`
- **PR:** https://github.com/mziyabo-glitch/the-golf-society-hub/pull/177 (not merging PR #175)

## Tests Cursor completed automatically (Playwright)

| Scenario | Spec | Notes |
|----------|------|-------|
| Platform-admin usage report access | `e2e/phase1-access.spec.ts` | PASS (Chromium + mobile) |
| Ordinary-member usage report rejection | `e2e/phase1-access.spec.ts` | PASS |
| M4 ManCo tee-sheet access | `e2e/phase1-access.spec.ts` | PASS — QA M4 society event |
| ZGS ManCo tee-sheet access | `e2e/phase1-access.spec.ts` | PASS — QA ZGS society event |
| Cross-society event access rejection | `e2e/phase1-access.spec.ts` | PASS — no other-society data leak |
| Standard-event paid-player pool | `e2e/phase1-pools.spec.ts` | PASS |
| Joint M4/ZGS player pool | `e2e/phase1-pools.spec.ts` | PASS |
| Dual-member deduplication | `e2e/phase1-pools.spec.ts` | PASS |
| Late-paid player refresh | `e2e/phase1-pools.spec.ts` | PASS — `mark_event_paid` + Regenerate |
| Save Draft | `e2e/phase1-lifecycle.spec.ts` | PASS |
| Leave and reopen | `e2e/phase1-lifecycle.spec.ts` | PASS |
| Publish / Update Published Tee Sheet | `e2e/phase1-lifecycle.spec.ts` | PASS |
| Nearest-to-pin persistence | `e2e/phase1-lifecycle.spec.ts` | PASS |
| Longest-drive persistence | `e2e/phase1-lifecycle.spec.ts` | PASS |
| Attendee CSV export | `e2e/phase1-exports.spec.ts` | PASS — file + event name + member rows |
| Shared tee-sheet view | `e2e/phase1-exports.spec.ts` | PASS — share payload event/players |
| PNG generation / republish payload | `e2e/phase1-exports.spec.ts` | PASS — Share/Download + republished payload |

Run: `PLAYWRIGHT_BASE_URL=… npm run test:e2e:phase1`

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
| iOS share sheet / Files save for PNG/PDF | System UI; share screen notes iPhone Safari requires a manual tap |
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
