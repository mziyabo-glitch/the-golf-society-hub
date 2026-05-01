# Works-Like-An-App QA Checklist

Manual validation checklist for mobile-native feel and PWA install quality.

## Test setup
- Device A: iPhone (latest iOS Safari + installed web app icon).
- Device B: Android (Chrome + installed web app icon).
- Network modes: normal Wi-Fi, throttled 3G, and offline toggle.
- Start from signed-out state and clear browser/site data once.

## 1) Fresh install/open
- Open the URL in browser; verify branding, splash, and no desktop-style layout.
- Install to home screen; launch from icon.
- Confirm app opens in standalone mode (no browser URL bar/chrome during app usage where platform supports it).
- Confirm theme color and icon look correct on launcher and splash.

## 2) Login flow
- Sign in with a valid account.
- Confirm no flicker back to login after successful auth.
- Confirm loading overlay appears while session/bootstrap resolves.
- Force-close app and relaunch; confirm still signed in.
- Put app to sleep for 2+ minutes; wake and confirm session still valid.

## 3) Society persistence
- Note active society on Home.
- Force-close and relaunch; confirm same active society remains selected.
- Switch to another society; navigate between tabs and return Home.
- Force-close and relaunch; confirm switched society persists.

## 4) Navigation + back behavior
- Navigate: Home -> Events -> Event detail -> subflows (players, tee sheet, points) -> back.
- Confirm Android hardware back always returns predictably and never blanks.
- Open deep links directly (invite, event route, course data route) and use Back/Close.
- Confirm fallback route opens when no history exists (no dead-end back button).

## 5) Event + RSVP/payment flow
- Open event detail from events list.
- Join RSVP flow (member path and guest/public invite path if available).
- Trigger a validation error and confirm friendly inline message (no blank state).
- Complete RSVP/payment route and verify confirmation state appears.

## 6) Tee sheet flow
- Open tee sheet screen and confirm loading state while data loads.
- Generate or load an event tee sheet and move between sections.
- Verify no table-overflow/web-like cramped layout on mobile width.
- Confirm action buttons do not submit twice on rapid taps.

## 7) Free Play scorecard start/resume
- Start a Free Play round and enter a few scores.
- Background app or close/reopen; re-open round and confirm state is intact.
- Continue scoring with poor network; confirm friendly feedback (not blank or crash).
- Confirm loaders/notices remain readable and touch controls remain large enough.

## 8) Weather card flow
- Open weather from Home and from Event detail.
- Confirm the route opens with expected course/date context.
- Verify loading/error states show helpful text when API is slow/unavailable.

## 9) Poor connection/offline behavior
- With network normal, load Event detail, Weather tab, Members, Event finance, Free Play home, and an in-progress Free Play scorecard; then enable airplane mode or block the API host.
- Confirm the **offline / no-connection banner** appears at the top (not obscuring primary actions) and dismisses when connectivity returns.
- **Event detail:** After a successful load, force a failed refresh (offline); confirm the **last event overview** still shows and a **Try again** (or pull-to-refresh) path exists—not a blank screen.
- **Weather tab:** If the schedule fails while you already had events, confirm cached schedule (or last good state) remains visible with a clear retry/update message—not an empty white screen.
- **Members:** Trigger a load failure; confirm **Try again** refetches; with cached members, list stays visible while retrying.
- **Event finance:** Same as members—stale totals visible on refresh failure, full-screen retry only when there was no prior data.
- **Free Play home:** Open with data once, then go offline; confirm **last rounds list** (from cache) still appears with **Could not refresh** + **Try again**; first visit with no cache should show a dedicated error screen with **Try again**, not a blank screen.
- **Free Play scorecard (in progress):** Enter scores, go offline or throttle; confirm scores on screen are not cleared by a failed background refresh; confirm **Could not refresh round** + **Try again** and optional **Saving scores…** when saves are in flight.
- Re-enable network and use each **Try again** control once; confirm data updates without requiring an app restart.

## 10) Touch-first UI quality
- Verify buttons, cards, and row targets are comfortable for thumbs.
- Confirm bottom tab labels/icons remain legible on small devices.
- Confirm forms stay usable with keyboard open (no blocked fields/buttons).
- Confirm modals and loaders feel native and centered with safe-area spacing.

## Exit criteria
- No blank screens in tested flows.
- No dead-end back behavior from deep-linked entry points.
- Session and active society persistence pass across restart/sleep.
- Installed PWA launches branded and standalone on both iOS and Android.
