# Phase 2 preview QA results

**Branch:** `cursor/phase2-app-debloat-f8f5`  
**Commit:** `ec1a174d` (+ this QA harness commit)  
**Date:** 2026-07-26  
**PR:** #178 (draft — do not merge automatically)

---

## Phase 1 ancestry confirmation

| Item | Status |
|------|--------|
| `origin/main` is ancestor of Phase 2 HEAD | **Yes** |
| PR #175 Phase 1 analytics / tee-sheet (`1bb8a56b`) | **Included** |
| Hardening: RPC grants, tee-sheet access, analytics tests (`376bbf6d`) | **Included** |
| Usage-report route fix PR #176 (`08a92b52` / `4a324e7b`) | **Included** |
| Migrations `176_product_events_and_analytics.sql`, `177_admin_product_events_summary_grants.sql` | **Present on branch** |
| Phase 1 unit tests (`phase1Analytics`, `teeSheetManageAccess`, `analyticsReportRepo`, …) | **Present; 491 unit tests PASS** |
| Phase 1 access e2e on Phase 2 build | **5/5 PASS** |

---

## Preview deployment

| Item | Value |
|------|--------|
| Vercel Preview (sha `ec1a174`) | https://the-golf-society-71xpgoyql-brian-dubes-projects.vercel.app |
| GitHub deployment | Preview, success |
| Access from this agent | **SSO-blocked** (Vercel Deployment Protection → 302 SSO) |
| QA execution environment | **Local static export of Phase 2 commit** served at `http://127.0.0.1:35227` with SPA fallback |
| Backend | Live Supabase `eaenzjwecrrbhibrvgsb` using isolated **QA Phase1** societies/events/accounts |
| Production web (`the-golf-society-hub.vercel.app`) | **Not** updated |

Human testers with Vercel SSO can use the Preview URL above against the same backend.

---

## Automated results summary

| Suite | Result |
|-------|--------|
| Unit tests | **491/491 PASS** |
| Phase 2 Playwright desktop | **23/23 PASS** (debloat + screenshots) |
| Phase 2 Playwright mobile-chrome (Pixel 7) | **22/22 PASS** |
| Phase 1 access on Phase 2 build | **5/5 PASS** |
| Phase 1 tee-sheet lifecycle (Save Draft / reopen / Publish / Update Published) | **4/4 PASS** |

---

## QA matrix

Legend: **PASS** / **FAIL** / **NOT TESTED**

### Navigation

| Check | Result | Notes |
|-------|--------|-------|
| Home has no Birdies League or Free Play cards | **PASS** | Ordinary member Home; no Birdies/Free Play cards |
| Events remains clear and functional | **PASS** | Events list shows QA fixtures |
| More → Society | **PASS** | Members / settings / profile |
| More → Events and tools | **PASS** | Calendar subscribe |
| More → Other golf tools | **PASS** | Free Play only |
| More → ManCo (captain) | **PASS** | Event admin, ledger, fees, finances |
| More → Platform admin | **PASS** | Usage report, club domains, course data, billing |
| Ordinary members do not see ManCo / platform links | **PASS** | Member More omits those sections |

### Tee sheet

| Check | Result | Notes |
|-------|--------|-------|
| Bare `/tee-sheet` redirects to Events | **PASS** | Lands on Events; analytics fired |
| Event → Manage → Manage Tee Sheet opens correct event | **PASS** | Title includes QA Phase1 M4 Standard Event |
| Bookmarked `?eventId=` still opens authorised event | **PASS** | |
| Unauthorised event IDs hide roster/payment details | **PASS** | Cross-society + Phase 1 access tests |
| Save Draft | **PASS** | Phase 2 + Phase 1 lifecycle |
| Publish | **PASS** | Phase 1 lifecycle on Phase 2 build |
| Update Published Tee Sheet | **PASS** | Phase 1 lifecycle on Phase 2 build |

### Live scoring

| Check | Result | Notes |
|-------|--------|-------|
| Scorecard absent from normal navigation | **PASS** | Not in tab bar; Home/More clean |
| Gross actions hidden when flag false | **PASS** | ZGS QA event |
| Gross accessible when flag enabled | **PASS** | Temporarily enabled on M4 QA event, then restored to `false` |
| Event scoring / OOM unaffected | **PASS** | Event overview + OOM tab remain; no regressions observed in access suite |

### Birdies League

| Check | Result | Notes |
|-------|--------|-------|
| No Birdies cards/settings visible | **PASS** | Home / More / Rivalries |
| Old deep link redirects to Rivalries | **PASS** | No blank/404 |
| Birdies DB data untouched | **PASS** | `birdies_leagues` count = 1 |

### Free Play

| Check | Result | Notes |
|-------|--------|-------|
| Appears only under Other golf tools | **PASS** | |
| Historical rounds openable | **PASS** | Route opens without 404 (owner ACL may limit content) |
| Create/view Free Play still works | **PASS** | Index loads; create UI present |

### Course Data Editor

| Check | Result | Notes |
|-------|--------|-------|
| Platform admin can access | **PASS** | |
| Captain cannot access | **PASS** | Redirects to More |
| Ordinary member cannot access | **PASS** | |
| Automated course imports unaffected | **PASS** | No import code/migrations changed in Phase 2 |

### Redirect analytics

| Check | Result | Notes |
|-------|--------|-------|
| `deprecated_route_opened` recorded | **PASS** | Confirmed in `product_events` (tee-sheet, birdies, scorecard, course-data) |
| `redirect_triggered` recorded | **PASS** | Paired with above |
| `legacy_feature_used` | **NOT TESTED** | Helper exists + unit-tested; Phase 2 redirects use `trackDeprecatedRedirect` (opens + redirect). No production UI path currently calls `trackLegacyFeatureUsed` alone |
| No names / emails / phones in metadata | **PASS** | SQL PII scan over last 6h: **0 hits**; sample metadata only `feature`, `old_route`, `destination_route` (+ society_id / platform columns) |

### Platforms

| Platform | Result | Notes |
|----------|--------|-------|
| Desktop web | **PASS** | Chromium Playwright |
| Mobile-width web | **PASS** | Pixel 7 project + mobile More screenshot |
| Android native | **NOT TESTED** | No EAS / device in this environment |
| iOS-compatible layout | **PASS** (web) | Mobile-width web layout; native iOS **NOT TESTED** |

---

## Screenshots (live authenticated)

<img alt="Home member" src="/opt/cursor/artifacts/screenshots/phase2-qa-home-member.png" />
<img alt="Events" src="/opt/cursor/artifacts/screenshots/phase2-qa-events.png" />
<img alt="More member" src="/opt/cursor/artifacts/screenshots/phase2-qa-more-member.png" />
<img alt="More ManCo" src="/opt/cursor/artifacts/screenshots/phase2-qa-more-manco.png" />
<img alt="More platform admin" src="/opt/cursor/artifacts/screenshots/phase2-qa-more-platform-admin.png" />
<img alt="Free Play under Other golf tools" src="/opt/cursor/artifacts/screenshots/phase2-qa-free-play-row.png" />
<img alt="Course data rejected" src="/opt/cursor/artifacts/screenshots/phase2-qa-course-data-rejected.png" />
<img alt="Tee-sheet redirect" src="/opt/cursor/artifacts/screenshots/phase2-qa-teesheet-redirect.png" />
<img alt="Birdies redirect" src="/opt/cursor/artifacts/screenshots/phase2-qa-birdies-redirect.png" />
<img alt="More member mobile" src="/opt/cursor/artifacts/screenshots/phase2-qa-more-member-mobile.png" />

---

## Risks / caveats

1. **Vercel Preview SSO** blocked direct browser QA of the hosted preview URL; automated QA used a local export of the same Phase 2 commit.
2. Write QA used **isolated QA Phase1** societies only (not live M4/ZGS production societies).
3. `legacy_feature_used` is implemented and unit-tested but not exercised by the current redirect helpers (which emit `deprecated_route_opened` + `redirect_triggered`).
4. Native Android/iOS builds were not produced.

---

## Recommendation

**Ready to merge**

Navigation, redirects, permissions, and the existing tee-sheet Save Draft / Publish / Update Published workflow passed on the Phase 2 build (desktop + mobile-width) with Phase 1 access checks green. Do **not** merge automatically — leave for human approval after optional SSO preview smoke on the Vercel URL.
