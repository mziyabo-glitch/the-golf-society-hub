# The Golf Society Hub

**Everything Golf Society**

A React Native app built with Expo for managing golf societies, events, and members.

## Features

- 🏌️ Create and manage golf societies
- 📅 Organize golf events
- 👥 Manage society members
- 💾 Local persistence with AsyncStorage
- 📱 Cross-platform (iOS, Android, Web)

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Branching & Deployment Strategy

- `main` → Production (Vercel Production Deployment)
- `dev` → Staging/Test (Vercel Preview Deployments)
- All testing happens on `dev`
- Only merge into `main` when stable
- Feature work branches from `dev`

## Deploy to Vercel (web)

This app uses Expo web static export. Vercel should run the build and publish the `dist` folder.

1. Configure environment variables in Vercel (build-time):
   - `EXPO_PUBLIC_FIREBASE_API_KEY`
   - `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
   - `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `EXPO_PUBLIC_FIREBASE_APP_ID`
2. Build command: `npm run build`
3. Output directory: `dist`

## Firestore rules

The app writes event expenses to `events/{eventId}/expenses/{expenseId}`.
See `firestore.rules` for the current signed-in access rules (tighten these
for production as needed).

## Project Structure

- `app/` - Main application screens and routing
- `components/` - Reusable React components
- `constants/` - App constants and theme
- `hooks/` - Custom React hooks

## Tech Stack

- [Expo](https://expo.dev) - React Native framework
- [Expo Router](https://docs.expo.dev/router/introduction) - File-based routing
- [React Native](https://reactnative.dev) - Mobile app framework
- [AsyncStorage](https://react-native-async-storage.github.io/async-storage/) - Local data persistence

## Shared Course Library (Phase 1)

Golf Society Hub uses UK course discovery data from the Fairway Forecast repository
as the shared course library for event creation.

### What Phase 1 includes

- Supabase tables:
  - `public.courses_seed` (raw imported source rows)
  - `public.courses` (normalized/deduped course library)
- Import script: `scripts/importCoursesGb.ts`
- Admin review screen: `/(app)/courses-admin`
- Event Create uses course search/select from imported data (no free-text course input)

### Run the import

1. Apply latest Supabase migrations (includes `038_courses_library_phase1.sql`).
2. Make sure you have:
   - a local checkout of Fairway Forecast, or direct access to `data/courses/gb.json`
   - Supabase URL + service role key
3. Set env vars in your shell:

```bash
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
```

4. Run import (from repo root):

```bash
npm run import:courses:gb -- --file ../fairway-forecast/data/courses/gb.json
```

Optional:

- `--dry-run` to validate/parse without writing
- `--country gb` (defaults to `gb`)
- `--source fairway_forecast` (defaults to `fairway_forecast`)

Examples:

```bash
npm run import:courses:gb -- --file /absolute/path/to/fairway-forecast/data/courses/gb.json --dry-run
npm run import:courses:gb -- --file ../fairway-forecast/data/courses/gb.json
```

### Notes

- Phase 1 does **not** include scraping, tee/rating derivation, or advanced matching logic.
- Import expects Fairway Forecast UK schema rows like:
  `["Abbey Hill Golf Centre", 52.04426, -0.81176, "Milton Keynes"]`
- `normalized_name` is persisted for dedupe + search.

## Course Enrichment (Phase 2)

Phase 2 enriches imported courses with tee/rating metadata and introduces a review
workflow for uncertain matches.

### Schema additions

- `public.courses` enrichment fields:
  - `enrichment_status` (`pending` default)
  - `matched_source`
  - `matched_name`
  - `match_confidence`
  - `reviewed_at`
  - `reviewed_by`
- `public.tees` stores tee metadata:
  - `tee_name`, `tee_color`, `gender`
  - `par`, `course_rating`, `slope_rating`
  - `source`, `source_ref`, `is_verified`
- `public.course_enrichment_runs` stores enrichment audit payloads.
- `public.events.tee_id` persists selected tee row on events.

### Matching rules

- **Never match on name alone**
- Match confidence uses:
  - normalized name similarity
  - area similarity
  - coordinate proximity
- Decision thresholds:
  - `>= 0.86` and eligibility checks pass → `matched`
  - `>= 0.68` and `< 0.86` → `needs_review`
  - below review threshold or no candidates → `needs_review` / `skipped`

### Run enrichment

Required env:

```bash
export SUPABASE_URL="https://<project-ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
```

Run:

```bash
npm run enrich:courses -- --candidates-file ../fairway-forecast/data/courses/gb-enriched.json
```

Useful flags:

- `--dry-run` (no database writes)
- `--course-id <uuid>` (single-course debug mode)
- `--limit <n>` (batch size in one run)
- `--high-threshold <num>`
- `--review-threshold <num>`

The script prints summary counts:

- matched
- needs_review
- failed
- skipped

### Manual review workflow

Use `/(app)/courses-admin` (Course Enrichment Admin) to:

- filter courses by enrichment status
- inspect proposed match + confidence
- accept/reject proposed match
- edit matched name manually
- add tee rows manually
- mark course as complete after review

### Event setup integration

In Event Create/Edit:

- selecting a course loads available tee sets
- tee selection is required when tee metadata exists
- selected tee is stored on `events.tee_id`
- tee values are copied into event snapshot fields for scoring compatibility

## Learn more

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
