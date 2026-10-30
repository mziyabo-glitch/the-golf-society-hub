# Phase 2 — App de-bloat plan (pre-implementation)

Production snapshot (2026-07-26, project `eaenzjwecrrbhibrvgsb`):

| Signal | Count |
|--------|------:|
| `event_player_rounds` / hole scores | 0 / 0 |
| Events with `live_gross_scoring_enabled` | 0 |
| `free_play_rounds` | 4 |
| `birdies_leagues` | 1 (no usable birdie result data in UI) |
| `finance_entries` | 2 |
| `licence_requests` | 1 |
| `course_data_submissions` | 0 |
| `oom_awards` / `oom_champions` | 0 / 3 |

**No database tables will be dropped.** No production rows will be deleted.

---

## 1. Route / feature removal list (user-facing)

| Item | Action |
|------|--------|
| Settings → “Tee sheet generator” / admin quick Tee Sheet | **Remove nav** (journey is Event → Manage → Manage Tee Sheet) |
| Bare `/(app)/tee-sheet` without `eventId` | **Redirect** → Events + analytics |
| Scorecard tab (already `href: null`) | **Keep hidden**; add deprecation comment; direct open without enabled event → redirect |
| Event gross-score CTAs when flag off | **Already gated**; reinforce + deprecate comments |
| Home Birdies League card | **Never show** unless birdie recording feature flag + valid results |
| Settings → Birdies League quick action | **Remove** |
| Rivalries → Birdies League society competition row | **Remove** |
| `/(app)/birdies-league` deep link | **Redirect** → Rivalries/More when UI disabled |
| More → three duplicate Free Play rows | **Collapse** to one row under “Other golf tools” |
| Personal Mode Home Free Play hero card | **Remove** (Free Play via More only) |
| Scorecard → Free Play CTAs | **Remove / redirect** (scorecard deprecated hub) |
| Club domain review for captains (More/Settings) | **Restrict** to platform admin only |
| `/(app)/course-data/*` | **Gate** to platform admin; unauthorised → More + message |
| Legacy `/(app)/society` stub | **Redirect** → Settings |
| Unused `HomeQuickLinksSection` (if still unreferenced) | **Delete component** if confirmed dead |

### Not removed (core / in use / required)

Events, signup, payments, event manage, tee-sheet editor (`/(app)/tee-sheet?eventId=`), published member tee-sheet, joint events, OOM tab + roll-of-honour, Rivalries/Sinbook, prize pools, members, exports, calendar subscribe, usage report, billing/licences, treasurer ledger, membership fees, event finance.

---

## 2. Features hidden rather than deleted

| Feature | Hide mechanism | Code retained |
|---------|----------------|---------------|
| Live gross scoring | Event flag `live_gross_scoring_enabled`; no nav | `gross-scores/*`, scorecard screen, tables |
| Birdies League | `isBirdiesLeagueUiEnabled()` = false (needs recording + data) | `birdiesLeagueRepo`, tables |
| Course Data Editor | Platform-admin gate on routes | `course-data/*`, import jobs |
| Club domain review | Platform-admin only (was captain) | `admin/course-domains` |
| Generic tee-sheet entry | Redirect when no `eventId` | Full editor + publish logic |

---

## 3. Files proposed for deletion

| File | Reason |
|------|--------|
| `features/home/components/HomeQuickLinksSection.tsx` | Unused (confirm no imports) |
| Possibly unused tests only if they solely cover removed nav (prefer update over delete) |

**Not deleting:** `app/(app)/tee-sheet.tsx`, `birdies-league/*`, `free-play/*`, `course-data/*`, `gross-scores/*`, finance/billing screens.

---

## 4. Files proposed for modification

| Area | Files |
|------|-------|
| Feature flags | `lib/featureVisibility.ts` (+ tests) |
| Analytics | `lib/analytics/trackEvent.ts`, `types.ts`, new helpers/tests |
| Tee-sheet entry | `app/(app)/tee-sheet.tsx`, `app/(app)/(tabs)/settings.tsx` |
| Tabs / scorecard | `app/(app)/(tabs)/_layout.tsx`, `scorecard.tsx` |
| Birdies | Home dashboard/view, `sinbook.tsx`, `RivalriesSocietyCompetitionsSection.tsx`, `birdies-league/index.tsx`, settings |
| Free Play | `more.tsx`, `PersonalModeHome.tsx`, scorecard |
| Course admin | `more.tsx`, settings, `course-data/*` gates, course-domains |
| Legacy society | `app/(app)/society.tsx` |
| Redirects | small `lib/navigation/deprecatedRoute.ts` (or similar) |
| Docs | `docs/phase2-debloat-plan.md` (this file), matrix/results after |
| Tests | new `lib/phase2Debloat*.test.ts`, visibility + redirect tests |

---

## 5. Database tables retained (explicit)

All existing tables retained, including at least:

`events`, `event_registrations`, `tee_groups`, `tee_group_players`, `tee_sheet_player_policy`, `event_player_rounds`, `event_player_hole_scores`, `birdies_leagues`, `free_play_rounds`, `free_play_round_players`, `finance_entries`, `licence_requests`, `course_data_submissions`, `oom_awards`, `oom_champions`, `product_events`, and all related import/staging tables.

---

## 6. Redirect map

| Old / deprecated | Destination | Analytics |
|------------------|-------------|-----------|
| `/(app)/tee-sheet` (no `eventId`) | `/(app)/(tabs)/events` | `redirect_triggered` / `deprecated_route_opened` |
| `/(app)/(tabs)/scorecard` when no live-gross today | `/(app)/(tabs)/events` | same |
| `/(app)/birdies-league` when UI disabled | `/(app)/(tabs)/sinbook` | same |
| `/(app)/course-data/*` non–platform-admin | `/(app)/(tabs)/more` | same |
| `/(app)/admin/course-domains` non–platform-admin | `/(app)/(tabs)/more` | same |
| `/(app)/society` | `/(app)/(tabs)/settings` | same |
| Legacy `/(admin)/usage-report`, `/(admin)/course-domains` | existing redirects to `/(app)/admin/...` | unchanged |

---

## 7. Risks and rollback

| Risk | Mitigation |
|------|------------|
| ManCo loses tee-sheet if they bookmarked bare generator | Redirect to Events; Manage Event still opens `tee-sheet?eventId=` |
| Captain needs club domain review | Platform admin still has access; can re-enable captain link in one commit |
| Free Play users miss Home card | Still on More → Other golf tools; historical rounds intact |
| Birdies deep links break | Soft redirect to Rivalries |
| Rollback | Revert PR branch; no schema migrations in this phase |

---

## Implementation order

1. Feature-visibility + analytics helpers  
2. Tee-sheet bare-route redirect + remove Settings links  
3. Gross scoring / scorecard deprecation  
4. Birdies hide + redirects  
5. Free Play More simplification + Home demotion  
6. Course admin platform-only gates  
7. More screen restructure  
8. Dead code + tests + screenshots + PR (no merge)
