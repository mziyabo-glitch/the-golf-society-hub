# Phase 1 manual QA checklist

Use this checklist after deploying branch `cursor/phase1-analytics-teesheet-f8f5` to a preview or controlled staging environment. Sign in with real test accounts for M4, ZGS, joint, member, and platform-admin roles.

**Do not mark items complete until verified in an authenticated session on the target environment.**

---

## M4 standard event

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Sign in as M4 ManCo (Captain/Secretary/Treasurer/Handicapper) | Home loads with M4 active society |
| 2 | Open an upcoming M4-only event → Manage | Event manage screen loads |
| 3 | Confirm paid members appear in tee-sheet pool; unpaid excluded when payment required | Only paid + confirmed players eligible |
| 4 | Open **Manage Tee Sheet** | Tee sheet editor opens for that event |
| 5 | Add groups, set NTP/LD holes, assign tees | Editor accepts changes without error |
| 6 | **Save Draft** | Success toast; draft persists |
| 7 | Navigate away, reopen same event tee sheet | Groups, player order, NTP/LD, start time restored |
| 8 | **Publish Tee Sheet** | Publish succeeds; event shows published tee times |
| 9 | Edit groups and **Update Published Tee Sheet** | Existing players remain; published version updates |
| 10 | **Share / Export** (PNG) | PNG generates and shares/downloads; no PII in analytics |
| 11 | Export attendees CSV (web) | CSV downloads with expected rows |

## ZGS standard event

Repeat steps 1–11 with a ZGS ManCo account and ZGS-only event. Expect the same behaviour scoped to ZGS.

## M4/ZGS joint event

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Sign in as ManCo for M4 or ZGS | Active society matches a participating club |
| 2 | Open joint M4/ZGS event → Manage Tee Sheet | Editor loads with combined pool |
| 3 | Verify M4 and ZGS paid members appear | Both societies represented |
| 4 | Verify dual member appears once | No duplicate row for same person |
| 5 | Verify guest handling matches event rules | Guests appear only when paid/eligible |
| 6 | Save draft, refresh pool (return from manage after marking late payment) | Saved sheet players not removed; late-paid player can be added |
| 7 | Publish and re-export PNG | Joint branding/logos render; export succeeds |

## Late-paid member

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | On event manage, mark an unpaid member as paid | Payment status updates |
| 2 | Return to tee sheet (or refresh pool) | Member appears in eligible pool |
| 3 | Add to sheet and save | Member persists on draft |

## Cross-society access control

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | As M4 ManCo, open `/(app)/tee-sheet?eventId=<unrelated-zgs-event-uuid>` | **Access Restricted** message; redirect to Events offered; no player/payment data shown |
| 2 | As ordinary M4 member, open tee sheet URL directly | ManCo restriction or permission message; cannot save/publish |
| 3 | Signed out, open tee sheet URL directly | Auth/login gate; no data exposed |
| 4 | As platform admin, open usage report | Report loads with 7/30/90-day windows |
| 5 | As ordinary ManCo, open usage report or course domains | Platform admin required message |

## Calendar, Members, analytics

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Events tab → calendar subscribe card | Subscribe/export instructions visible |
| 2 | More → Members (ManCo) | Members screen reachable |
| 3 | Perform RSVP, mark payment, save/publish tee sheet, export CSV/PNG/PDF | Events appear in platform admin usage report (counts only, no PII) |

## Layout and routing

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Android: tee sheet editor and event manage | Layout readable; buttons reachable |
| 2 | iOS: same screens | No overlap/clipping on small devices |
| 3 | Web: direct URL to tee sheet with `?eventId=` | Loads after auth; refresh preserves route |
| 4 | Web: `/(admin)/course-domains` as platform admin | Course domains review screen loads (not 404) |
| 5 | Web: `/(admin)/usage-report` as platform admin | Usage report loads (not 404) |

## Sign-off

| Role | Tester | Date | Pass/Fail | Notes |
|------|--------|------|-----------|-------|
| M4 ManCo | | | | |
| ZGS ManCo | | | | |
| Joint ManCo | | | | |
| Platform admin | | | | |
| Ordinary member | | | | |

**Production-ready criterion:** All critical rows above pass in preview/staging with real authenticated accounts before merging to production.
