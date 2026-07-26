# Phase 2 — Post-implementation results

**Branch:** `cursor/phase2-app-debloat-f8f5`  
**Recommendation:** Ready for preview QA  
**Do not merge automatically.**

## Confirmation: no production data or tables deleted

- No Supabase migrations in this phase
- No `DROP TABLE` / no row deletes
- All scoring, birdies, free-play, finance, licence, and course tables retained

## Changed-file summary

| Area | Files |
|------|--------|
| Feature flags | `lib/featureVisibility.ts` |
| Redirects / inventory | `lib/navigation/deprecatedRoute.ts`, `phase2RouteInventory.ts` |
| Analytics | `lib/analytics/types.ts`, `trackEvent.ts`, `index.ts` |
| Tee sheet | `app/(app)/tee-sheet.tsx` (bare → Events) |
| Tabs / scorecard | `_layout.tsx`, `scorecard.tsx` |
| More / Settings | `more.tsx`, `settings.tsx` |
| Birdies | `birdies-league/index.tsx`, `sinbook.tsx`, home dashboard |
| Free Play | `PersonalModeHome.tsx` (card removed); More keeps entry |
| Course admin | `course-data/index.tsx`, tee editor (platform admin only) |
| Gross scores | `gross-scores/_layout.tsx`, `players.tsx` |
| Legacy | `society.tsx` → Settings |
| Docs / tests | `docs/phase2-debloat-plan.md`, `lib/phase2Debloat.test.ts`, `lib/phase2NavIntegrity.test.ts` |

## Deleted-file summary

| File | Reason |
|------|--------|
| `features/home/components/HomeQuickLinksSection.tsx` | Confirmed unused (no imports) |

## Route inventory (before → after)

| Route | Before | After |
|-------|--------|--------|
| `/(app)/tee-sheet` (no eventId) | Standalone generator from Settings/More | **Redirect → Events** + analytics |
| `/(app)/tee-sheet?eventId=` | ManCo editor | **Unchanged** (Event → Manage → Manage Tee Sheet) |
| `/(app)/(tabs)/scorecard` | Hidden tab; Free Play CTAs | Hidden; **redirect unless today live-gross** |
| `/(app)/event/.../gross-scores/*` | Role-gated | **Also requires `live_gross_scoring_enabled`** |
| `/(app)/birdies-league` | Linked from Home/Rivalries/Settings | **Redirect → Rivalries** while flag off |
| `/(app)/free-play` | Home + More duplicates | **More → Other golf tools only** |
| `/(app)/course-data/*` | Captain/Secretary/Handicapper | **Platform admin only** |
| `/(app)/admin/course-domains` | Captain could open from Settings | **Platform admin (More)** |
| `/(app)/society` | Dead stub UI | **Redirect → Settings** |

Full intended inventory: `lib/navigation/phase2RouteInventory.ts`.

## Screenshots

Structure captures (authenticated preview screenshots recommended on Vercel preview):

- <img alt="Home / Events / More structure" src="/opt/cursor/artifacts/screenshots/phase2-home-events-more.png" />
- HTML mock: `/opt/cursor/artifacts/screenshots/phase2-ui-mocks.html`

## Test results

```
Test Files  74 passed (74)
Tests       491 passed (491)
```

New coverage: bare tee-sheet redirect, gross visibility flag, Birdies hidden, course-data platform gate, deprecated analytics, More/Home/Settings link integrity, route inventory.

## Remaining legacy features (hidden, not deleted)

- Live gross scoring (event flag)
- Birdies League (`BIRDIES_LEAGUE_UI_ENABLED = false`)
- Course Data Editor (platform admin direct route)
- Free Play (More secondary section; historical rounds intact)
- Treasurer / event-finance / billing / licence-requests (retained for access control)

## Future DB cleanup (not this phase)

Only after confirmed zero adoption and analytics on `deprecated_route_opened` / `legacy_feature_used`:

1. `event_player_rounds` / `event_player_hole_scores` (if still unused)
2. `birdies_leagues` (if recording never ships)
3. Optional archive of unused finance/audit UI tables

## Recommendation

**Ready for preview QA**
