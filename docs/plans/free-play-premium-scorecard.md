# Free Play Premium Scorecard — Implementation Plan

Flagship-quality, mobile-first scoring (benchmarks: **GameBook** social energy + live feel, **Golfshot** hole focus + clarity, **ParUp** society-first roster — **not** copying their UIs).

## Current codebase (inspected)

| Area | Location | Notes |
|------|----------|--------|
| Free-play home / setup | `app/(app)/free-play/index.tsx` | Course search, trust, tees, format, players, create |
| Round detail / scoring | `app/(app)/free-play/[id].tsx` | Large screen: header, hole grid, quick entry, handicaps |
| Data + RLS | `lib/db_supabase/freePlayScorecardRepo.ts` | CRUD, join by code |
| Pure scoring | `lib/scoring/freePlayScoring.ts` | Stableford + stroke net leaderboard, hole snapshots |
| Course / tees / holes | `lib/db_supabase/courseRepo.ts` | Search, tees, holes, trust |
| Types | `types/freePlayScorecard.ts` | Round, players, formats |

**Gaps vs product vision:** single long scroll setup (no stepper wizard), detail screen is functional not “on-course dashboard”, no segmented Simple/Stats/Card modes, no sticky live leaderboard sheet, summary is not share-forward, SI missing only partially surfaced.

## Design tokens

- `lib/ui/freePlayPremiumTheme.ts` — deep green / navy / cream surfaces, card radii, shadows (Phase 0). Expand as screens migrate.

## Phased delivery

### Phase 0 — Foundation (done in repo first slice)

- Premium **Start** hero + **setup stepper** on home.
- “Resume round” when `listMyActiveFreePlayRounds` non-empty.
- Document plan (this file).

### Phase 1 — Setup wizard UX

- Route or modal wizard: **Course → Tee → Format → Players → Handicap review → Start** (chip progress + one focus per step).
- **Course card**: name, location, holes 9/18, tee metadata table, trust badges, **SI missing** warning when any `course_holes.stroke_index` null + Stableford copy.
- **Player cards**: horizontal scroll or stacked cards, initials, HI/PH, society badge, status chips (member / guest / invited).

### Phase 2 — On-course “wow” screen (`[id]`)

- **Sticky header**: course, hole N/M, par, SI, yardage, format, mini running totals (reuse `buildFreePlayLeaderboard`).
- **Hole hero card**: large par/SI/yardage; placeholder Front/Middle/Back for future GPS.
- **Score entry**: large tap targets, − / + / Par / Bogey / Double / Pickup; optional **haptics** (`expo-haptics`).
- **Segmented control**: Simple | Stats | Card (Card = horizontal scroll grid).
- **Stats mode**: putts, FIR, GIR, penalties, bunker — optional columns or second row (DB may need migration later).
- **Leaderboard sheet**: bottom pill opens `BottomSheet` / modal with position, thru, gross, net, SF, movement arrows (compare to previous hole snapshot in client state).

### Phase 3 — Post-round

- Dedicated **summary** route or full-screen modal: winner, leaderboard, best 9s, birdies count, share CTA.
- Future: PNG share card (society logo + GSH branding) — align with org-wide share-card initiative.

### Phase 4 — Real-time & games

- Supabase **realtime** subscriptions on `free_play_round_hole_scores` for multi-device leaderboard.
- Match play, skins, NTP, longest drive, pots — new tables + scoring engines; feature-flag.

## Technical dependencies

- **SI / Stableford**: already uses `freePlayHolesToSnapshots` defaults; UI must warn instead of silent defaults when SI missing from DB.
- **Handicap copy**: WHS labels HI / CH / PH already partially in detail; expand on dedicated review step.
- **Performance**: memoize leaderboard per hole; avoid re-fetch whole bundle every keystroke where possible.

## Out of scope (until data product ready)

- Full GPS / wind — layout placeholders only.

## Acceptance (incremental)

- Phase 0: home feels like a **product entry**, not a form dump; stepper reflects progress; resume visible.
- Phase 2: one-handed score entry usable on small phone; leaderboard visible without leaving hole context.
