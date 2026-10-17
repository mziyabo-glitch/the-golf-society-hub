# Attendee confirmation regression fix (Phase 5 prep)

## A. Files and functions responsible

| Location | Role |
|----------|------|
| **`app/(app)/event/[id]/players.tsx`** | **Load (useEffect):** Decides joint vs standard; for joint, sets `selectedPlayerIds` from `jointPayload.entries` only (no merge with `event.playerIds`). **Save:** Joint path calls `syncJointEventEntries`; standard calls `updateEvent(..., { playerIds })`. **Render:** Tick = `selectedPlayerIds.has(member.id)`. |
| **`app/(app)/event/[id]/index.tsx`** | **Load (loadEvent):** For joint, sets `jointEntries` from `getJointEventDetail().entries`; does not use `baseEvent.playerIds` for count. **Display:** "X confirmed" and "Confirmed players" from `jointEntries` / `jointConfirmedCount`. |
| **`lib/db_supabase/jointEventRepo.ts`** | `getJointEventDetail` (RPC) returns `entries` from **event_entries** only. `syncJointEventEntries` writes/removes **event_entries** and eligibility. |
| **`lib/db_supabase/eventRepo.ts`** | `getEvent` returns `playerIds` from **events.player_ids**. `updateEvent` can write `player_ids`. |
| **`supabase/migrations/066_*`** | RPC builds `event` object **without** `player_ids`; returns `entries` from **event_entries** only. |

**Where confirmed attendees stopped being restored:** In **`players.tsx`** load, for joint events we set `selectedPlayerIds` only from `jointPayload.entries`. We never merged in `evt.playerIds`. So any confirmation that existed only in **events.player_ids** (legacy or pre–joint-event work) was ignored, and those players were not ticked.

---

## B. Root cause (plain English)

After the joint-event work, **joint events** use **event_entries** as the source of truth for “who is confirmed”. The **Players** screen loads that list from `getJointEventDetail().entries` and sets the checkboxes from it. It does **not** read **events.player_ids** for joint events.

Many events (including joint ones) had already had confirmations saved earlier into **events.player_ids** (the old path). Those rows were never copied into **event_entries**. So:

- **ZGS** players that were confirmed *after* the joint flow was deployed were written into **event_entries** by `syncJointEventEntries`, so they appeared and stayed ticked.
- **Host (or other) society** players that were confirmed *before* that, or before event_entries was used, stayed only in **events.player_ids**. The UI no longer read that for joint events, so they appeared **unticked** even though the data was still in the DB.

So the bug was **wrong source of data for initial tick state**: we used only `event_entries` for joint events and ignored legacy `events.player_ids`, so confirmations that existed only in `player_ids` were never restored into the checkbox state.

---

## C. Fix applied

1. **Players screen (`players.tsx`)**  
   For **joint** events, when building the initial `selectedPlayerIds` we now **merge**:
   - `jointPayload.entries[].player_id` (event_entries), and  
   - `evt.playerIds` (events.player_ids, legacy)  
   so that anyone who was ever confirmed in either place is shown as ticked. Saving still runs `syncJointEventEntries`, so the next save will persist everyone into **event_entries** and the two sources stay in sync going forward.

2. **Event detail (`index.tsx`)**  
   For joint events we now keep a **legacy confirmed count** from `baseEvent.playerIds.length` and show the confirmed count as **max(entries.length, legacyConfirmedCount)** so the card doesn’t show “0 confirmed” when only legacy `player_ids` exist.

3. **Temporary logging**  
   - **Players load:** In `__DEV__`, we log `eventId`, `societyId`, `isJointEvent`, `persistedFromEntries`, `persistedFromEventPlayerIds`, `mergedCount`.  
   - **Players render:** In `__DEV__`, we log a short **tick status sample** (eventId, societyId, first few members’ `memberId` and `renderedTick`).

---

## D. Temporary console logging

- **On load (joint):**  
  `[players] attendee confirmation restore:`  
  `{ eventId, societyId, isJointEvent: true, persistedFromEntries, persistedFromEventPlayerIds, mergedCount }`

- **On load (standard):**  
  `[players] attendee confirmation restore:`  
  `{ eventId, societyId, isJointEvent: false, persistedFromEventPlayerIds }`

- **After render (sample):**  
  `[players] tick status sample:`  
  `{ eventId, societyId, memberCount, selectedCount, sample: [{ memberId, renderedTick }, ...] }`

- **Event detail (joint):**  
  `[EventDetail] Joint path (...):`  
  `{ eventId, societies, entries, legacyPlayerIdsCount }`

You can remove these once you’re satisfied with behaviour.

---

## E. Bug classification

- **Data missing in DB?** **No.** Legacy confirmations are still in **events.player_ids**.
- **Wrong query?** **No.** We correctly read both event_entries (RPC) and events (getEvent).
- **Wrong mapping?** **Yes.** We mapped “who is confirmed” only from **entries** for joint events and did not include **event.playerIds** in the initial selection.
- **Stale local state overwrite?** **No.** The problem was the **initial** state (what we set from the server), not a later overwrite.
- **Host/participant society mismatch?** **No.** The issue was ignoring legacy `player_ids` for everyone; ZGS looked correct because their confirmations had been written into **event_entries** after the joint flow was added.

**Conclusion:** Wrong mapping / wrong source for initial tick state (only event_entries, not merged with events.player_ids).

---

## Build / “uncommitted changes on GitHub” investigation

### Why the deployed build might look like it has uncommitted changes

1. **Local dev server vs deployed preview**  
   If you open **localhost** (e.g. Expo web on 8081) you are on your **local** app. The “GitHub build” (e.g. Vercel) is a separate deployment. So you can see new behaviour locally while the deployed app is still old (or the other way around). **Check the URL** (localhost vs your Vercel/preview URL).

2. **Local API on port 3001**  
   The **only** place that uses `localhost:3001` is **course search** in `lib/golfApi.ts` (when hostname is localhost and port 8081/19006). That does **not** affect event or attendee data. Attendee/confirmation data goes through **Supabase** (same client for local and deployed if they use the same env). So port 3001 is **not** why confirmation behaviour would differ.

3. **Shared Supabase**  
   Both local and deployed app typically use the same **EXPO_PUBLIC_SUPABASE_URL** / **NEXT_PUBLIC_SUPABASE_URL**. So they read/write the **same** Supabase data. If you fix data or logic locally and then open the **deployed** app, you see the same DB state. So “deployed looks different” is usually **code/branch**, not a different DB.

4. **Branch / Vercel preview**  
   Vercel previews are tied to a **branch**. If the preview you’re opening is for a branch that **has** the joint-event or confirmation changes, you’ll see that behaviour even if your **main** branch or local `git status` doesn’t show those commits. **Check which branch the preview is built from.**

5. **Service worker / cache / Expo web cache**  
   A cached bundle or service worker can show old UI or old behaviour even after a new deploy. **Hard refresh (Ctrl+Shift+R) or clear site data** for the preview URL; for Expo web, clear cache or run with cache disabled.

### Checks performed

- **Env / API base URL:**  
  Supabase URL comes from `EXPO_PUBLIC_SUPABASE_*` or `NEXT_PUBLIC_SUPABASE_*` in `lib/supabase.ts`. No attendee/confirmation path uses localhost.  
  `localhost:3001` is only used in `lib/golfApi.ts` for course search when running on localhost.

- **Web app pointing to localhost:**  
  Only for course search (golf API proxy). Event and confirmation flows use Supabase only.

- **Confirmation data in Supabase:**  
  Legacy confirmations live in **events.player_ids**. New joint confirmations live in **event_entries** (and eligibility). Both are in the same Supabase project; no separate “local” DB.

- **ZGS vs incorrect row:**  
  ZGS players that were confirmed **after** the joint flow are in **event_entries** and are returned by `get_joint_event_detail`, so they appear and stay ticked. Players confirmed only in **events.player_ids** (e.g. host society, older data) were not in **event_entries** and were not read for joint events, so they appeared unticked. The fix merges **event.playerIds** into the initial selection so both sources are honoured.

---

## Acceptance

- **Previously confirmed players** are restored as ticked on reload (merged from `event_entries` + `events.player_ids`).
- **Confirmation page** (Players) and **attendee list** (event detail) agree: both use the same logic (entries + legacy count), and after one save, everything lives in **event_entries**.
- **No society** loses confirmations after refresh; legacy `player_ids` are included until the next save syncs them into **event_entries**.
- **ZGS** remains correct (unchanged; still from **event_entries**).
- **Joint events** still work; we only added a merge and a legacy count.
- **Uncommitted local changes vs build:** Most likely you were comparing **local dev** with **deployed preview**, or a **preview from another branch**, or **cache**. Same Supabase data and no localhost in the confirmation path.
