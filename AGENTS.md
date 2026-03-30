# AGENTS.md

## Cursor Cloud specific instructions

### Overview

The Golf Society Hub is a React Native / Expo app (SDK 54) for managing golf societies, events, and members. It runs on iOS, Android, and Web. The backend is hosted Supabase (auth, Postgres, storage). There is no local backend to run — all backend calls go to a remote Supabase project configured via environment variables.

### Running the app

- **Web dev (recommended for cloud agents):** `npm run dev:web` — starts Expo web on port 8081 and the local Golf API proxy server on port 3001 concurrently.
- **Web only:** `npx expo start --web`
- **Mobile:** `npx expo start` (requires emulator or Expo Go on a device — not available in cloud VMs).

### Lint

```
npm run lint
```

Uses `expo lint` with ESLint caching in `.cache/eslint/`. The codebase has ~4 pre-existing lint errors (unescaped entities) and ~50 warnings (unused vars, import order) — these are in the existing code, not regressions.

### Build

```
npm run build
```

Runs `expo export -p web` and outputs to `dist/`.

### Environment variables

Copy `.env.example` to `.env` and fill in real values. Required for auth/data features:

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `EXPO_PUBLIC_SUPABASE_ENV` | `test` or `prod` |
| `EXPO_PUBLIC_APP_STAGE` | `beta` or `production` |
| `GOLF_API_KEY` | GolfCourseAPI key (optional, for course search) |

Without valid Supabase credentials, the app renders the UI but auth/data operations fail with "Failed to fetch".

### Caveats

- The `.cursor/environment.json` specifies `node-20` base image, but the project works with Node 20+ (22.x is fine).
- Run `mkdir -p .cache/eslint .cache/ts` before first lint if the cache dirs don't exist (the environment.json `start` command does this).
- There are no automated tests (no test framework configured). Testing is manual via the web browser.
- The dev API server (`scripts/dev-api-server.js`) requires `GOLF_API_KEY` to proxy golf course search requests; without it, those routes return 500.
