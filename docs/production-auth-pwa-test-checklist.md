# Production Test Checklist: Auth Persistence + PWA

## Auth persistence scenarios

- [ ] Email/password sign-in persists after full close + reopen (native app relaunch and browser close/reopen).
- [ ] Browser refresh/reload keeps user signed in and returns to app flow without auth bounce.
- [ ] Magic link sign-in persists after reopen/reload (including web remember-me behavior).
- [ ] Signed-out state persists after close/reopen (user remains signed out and lands on auth).
- [ ] Extended idle token refresh: leave app idle past access-token expiry window, reopen/foreground, verify session refreshes without forced logout.

## Guard and hydration checks

- [ ] While `authRestoring` is `true`, no route guard redirects to auth/onboarding.
- [ ] Once session is known, signed-in user can enter app routes even if profile/membership loading is still in progress.
- [ ] Signed-in bootstrap with slow profile query does not show login overlay or redirect loop.

## Logging checks (expected in console)

- [ ] `auth.initialize start` and `auth.initialize end`.
- [ ] `Boot getSession result` with `result: "present" | "absent"`.
- [ ] `[auth-persist-storage] read` with `result: "present" | "empty"` and storage medium.
- [ ] `auth state event` with `eventType`.
- [ ] `[_layout:redirect] guard inputs` for guard state snapshots.
- [ ] `[_layout:redirect] decision=...` final redirect reason logs.

## PWA / mobile web checks

- [ ] `dist/manifest.json` exists after export and includes `display: "standalone"`, icon, theme/background colors.
- [ ] Installed home-screen launch opens standalone app-like shell (browser chrome minimized by OS).
- [ ] Theme/status bar metadata (`theme-color`, Apple web-app tags) is present in `dist/index.html`.
- [ ] Viewport is full-height on mobile (`viewport-fit=cover` + `100dvh`) with no bottom/top scroll-gap artifacts.

