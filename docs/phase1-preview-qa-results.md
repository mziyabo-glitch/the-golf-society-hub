# Phase 1 preview QA results — PR #175

**Branch:** `cursor/phase1-analytics-teesheet-f8f5`  
**Commit deployed:** `376bbf6d77e0d5a97c5e3b23db1d6f8198f3f13e`  
**Date:** 2026-07-20  
**Tester:** Cursor Cloud Agent (automated environment)  
**PR merged?** No  

---

## Preview deployment

| Item | Value |
|------|--------|
| Status | Ready (Vercel Preview) |
| Branch alias | https://the-golf-society-hub-git-cursor-pha-5eaba3-brian-dubes-projects.vercel.app |
| Deployment URL | https://the-golf-society-bxcx526aw-brian-dubes-projects.vercel.app |
| Inspector | https://vercel.com/brian-dubes-projects/the-golf-society-hub/EnWMv9DqvunkjsrpBhDRpb6ibmnV |
| GitHub deployment | Preview env, sha `376bbf6d`, success at 2026-07-20T13:57:50Z |
| Production release | **Not** updated (`https://the-golf-society-hub.vercel.app` unchanged) |

### Access note

Preview URLs return **HTTP 302 → Vercel Deployment Protection SSO**. This agent cannot complete browser login through Vercel team SSO, so authenticated in-app QA from this environment was blocked.

### Database environment

| Check | Result |
|-------|--------|
| Supabase projects visible to org | **One only:** `eaenzjwecrrbhibrvgsb` |
| Production web bundle | Points at `https://eaenzjwecrrbhibrvgsb.supabase.co` |
| Isolated TEST project for preview | **Not found** |
| Safe to assume preview is isolated? | **No** — treat preview as sharing the live Supabase project unless Vercel Preview env vars are confirmed otherwise in the Vercel dashboard |

### Unintentional production data modification

**Cannot confirm safety for write QA.** Save Draft / Publish / mark paid on this preview would almost certainly write to the live project (`eaenzjwecrrbhibrvgsb`), including real events and tee sheets. This agent did **not** perform write QA for that reason.

**Read-only discovery only:** societies found include `M4 Fairway` (`0eb58347-7da5-49b5-b908-ee80d246a389`) and `Zambezi Golf Society` (`3ddf9225-4220-4f72-80fc-6039ab39b523`). Confirm which society the team treats as “ZGS” before write QA.

---

## Access instructions for human testers

1. Open the branch preview URL (Vercel team member may need Deployment Protection SSO).
2. Sign in with real app accounts (credentials are **not** in the repo).
3. In **Settings**, confirm the footer Environment / backend suffix matches the intended DB.
4. Prefer disposable or clearly marked test events for Save Draft / Publish.
5. Roles needed:
   - M4 ManCo (Captain / Secretary / Treasurer / Handicapper)
   - ZGS ManCo
   - Dual M4/ZGS member
   - Ordinary member (non-ManCo)
   - Platform administrator

Android/iOS: EAS preview builds were **not** started here (`EXPO_TOKEN` unavailable). Use web preview first, or run `npm run build:android:preview` with EAS secrets set to the intended backend.

---

## QA matrix

Legend: **PASS** / **FAIL** / **NOT TESTED**

### M4 standard event

| Check | Result | Notes |
|-------|--------|-------|
| Open Manage Event | NOT TESTED | No authenticated session; preview SSO-blocked |
| Paid-player warning accurate | NOT TESTED | |
| Open Manage Tee Sheet | NOT TESTED | |
| Add/move players | NOT TESTED | Would write live data |
| Save Draft | NOT TESTED | Would write live data |
| Close and reopen persistence | NOT TESTED | |
| Publish | NOT TESTED | Would write live data |
| Update Published Tee Sheet | NOT TESTED | Would write live data |
| Players preserved on republish | NOT TESTED | |

### ZGS standard event

| Check | Result | Notes |
|-------|--------|-------|
| Save Draft / reopen / Publish / Update Published | NOT TESTED | Same blockers |

### Joint M4/ZGS event

| Check | Result | Notes |
|-------|--------|-------|
| Paid M4 members appear | NOT TESTED | |
| Paid ZGS members appear | NOT TESTED | |
| Dual members appear once | NOT TESTED | Covered by unit tests only |
| Guests appear correctly | NOT TESTED | |
| Unrelated society members excluded | NOT TESTED | |
| Late-paid after refresh | NOT TESTED | |
| Saved players not removed on pool refresh | NOT TESTED | |

### Competition information persistence

| Field | Result |
|-------|--------|
| Nearest to pin | NOT TESTED |
| Longest drive | NOT TESTED |
| Tees | NOT TESTED |
| Starting holes | NOT TESTED |
| Group order | NOT TESTED |
| Notes | NOT TESTED |
| Guests | NOT TESTED |
| Manual overrides | NOT TESTED |

### Exports

| Export | Result |
|--------|--------|
| Tee-sheet PNG | NOT TESTED |
| Tee-sheet PDF | NOT TESTED |
| Attendees CSV | NOT TESTED |
| Shared tee-sheet view | NOT TESTED |

### Permissions

| Check | Result | Notes |
|-------|--------|-------|
| Ordinary member cannot manage tee sheet | NOT TESTED | Unit-tested in `teeSheetManageAccess.test.ts` only |
| M4 ManCo cannot manage unrelated society event | NOT TESTED | Unit-tested only |
| Manual `eventId` change does not reveal data | NOT TESTED | |
| Non-platform admin blocked from usage report | NOT TESTED | |
| Platform admin can access usage report | NOT TESTED | |

### Navigation

| Check | Result |
|-------|--------|
| Members for ManCo | NOT TESTED |
| Calendar subscription in Events | NOT TESTED |
| Free Play under More | NOT TESTED |
| Birdies hidden without data | NOT TESTED |
| Gross scoring hidden unless enabled | NOT TESTED |

### Platforms

| Platform | Result | Notes |
|----------|--------|-------|
| Web (direct URL + refresh) | NOT TESTED | Preview URL exists but SSO-blocked to agent |
| Android | NOT TESTED | No EAS token / no device |
| iOS | NOT TESTED | No build / no device |

---

## Automated coverage already present (not a substitute for this matrix)

- `npm test` on commit `376bbf6d`: **70 files / 466 tests passed**
- Access-control unit tests for M4/ZGS/joint/member/unauthenticated
- Tee-sheet pool / draft snapshot / warnings / competition helper tests
- Analytics export payload + screen-view dedupe tests

---

## Recommendation

### **Fixes required before merge**

Blockers are operational / access, not a new known product regression from this pass:

1. Complete authenticated preview QA with the five required roles (SSO access + credentials).
2. Confirm Vercel Preview env vars (Settings footer) — if they point at `eaenzjwecrrbhibrvgsb`, treat write QA as live-data surgery or provision a true TEST project first.
3. Optionally disable or grant Deployment Protection bypass for QA operators.
4. Android/iOS builds still needed for platform rows.

**Do not merge PR #175** until the matrix above has PASS (or accepted waivers) for M4, ZGS, and joint tee-sheet workflows.
