# Google Play Internal Testing – Release Checklist

## Prerequisites

1. **EAS CLI** installed: `npm install -g eas-cli`
2. **Expo account** linked: `eas login`
3. **Project configured**: `eas build:configure` (if not already done)
4. **EAS Secrets** set in [expo.dev](https://expo.dev) → Project → Secrets (see Environment Separation below)

## Environment Separation (Supabase)

| Profile      | Backend | EXPO_PUBLIC_SUPABASE_ENV |
|--------------|---------|---------------------------|
| development  | TEST    | `test`                    |
| preview      | TEST    | `test`                    |
| play         | TEST    | `test`                    |
| production   | PROD    | `prod`                    |

**Play Internal Testing uses the TEST Supabase backend.** Set EAS Secrets to your TEST project:

- `EXPO_PUBLIC_SUPABASE_URL` → your TEST Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` → your TEST Supabase anon key

For production builds (future), switch these secrets to your PROD project.

**Local development:** Copy `.env.example` to `.env` and fill with TEST credentials. Never commit `.env`.

The app shows **Environment: TEST** or **Environment: PROD** in Settings (footer) so you can confirm which backend you're connected to.

## Build Android App Bundle (AAB)

```bash
eas build --platform android --profile play
```

This produces an **Android App Bundle (.aab)** suitable for Google Play.

## UK Golf API queue growth (cron)

The scheduled job `scripts/nightly-course-import.ts` runs:

1. Curated seeds from `data/territory-seed-candidates.uk.json` (small list).
2. **GB list bulk seeds** from `datasets/osm/gb.json` (`[name, lat, lng, area?]` tuples) — enqueues each venue name as a UK Golf API search string (territory inferred from coordinates). Cap per run: `UK_GOLF_API_OSM_SEED_MAX_NEW` (default 500 locally; workflow sets 400). Override file with `UK_GOLF_API_OSM_SEED_JSON_PATH`. Disable with `UK_GOLF_API_OSM_SEED_DISABLE=true`.
3. `uk-golf-api-process-queue` which calls the RapidAPI UK Golf Course Data API to stage candidates.

Run OSM seeding alone:

```bash
npm run course-import:ukgolfapi:seed-queue-from-osm
```

## Android versionCode policy (Play)

- Google Play requires each uploaded Android App Bundle to use a strictly higher `versionCode` than previous uploads.
- This project uses EAS **remote app versioning** (`cli.appVersionSource = "remote"`), so EAS owns Android `versionCode`.
- Store upload profiles (`play`, `production`) use `autoIncrement: true` to prevent version reuse.
- Keep `expo.version` as the user-facing app version; do not manually set or reset `expo.android.versionCode` locally.
- If your upload key was recently reset, Play may block uploads until the reset propagation window ends (current block window shown by Play: **May 8, 2026 06:18:04 UTC**).

## Play upload signing key (EAS)

Google Play checks the **upload certificate** on every `.aab`. The fingerprint Play expects for this app must match the keystore EAS uses to sign release builds.

- **Expected Play upload cert SHA1:** `36:76:A2:87:C3:15:DB:2A:17:AD:6B:95:0C:43:4D:A9:F8:98:D3:18`
- The repo’s `upload_cert.pem` (public cert only) matches that SHA1. Verify anytime:

```bash
node scripts/print-pem-sha1.mjs upload_cert.pem
```

If Play reports a **different** SHA1 for the bundle you uploaded, EAS is using the **wrong Android upload keystore** (for example credentials Expo generated earlier, or another project’s keystore).

### Fix: point EAS at the correct upload keystore

1. Locate the **private** keystore (`.jks` / `.keystore`) whose **upload** certificate matches the expected SHA1 above. The public half should match `upload_cert.pem`. If you only have `.pem` and not the private key, you cannot sign; use Play Console to register a new upload key (and wait for any propagation window).
2. Update Expo-hosted credentials (recommended for CI):

   ```bash
   eas credentials -p android
   ```

   Choose the **`play`** and **`production`** profiles (or whichever you use for store uploads) and set **Upload keystore** to that file, with correct keystore password, key alias, and key password.

3. Optional — local signing for builds only on your machine: copy `credentials.example.json` → `credentials.json`, fill in paths and secrets (keep `credentials.json` out of git), then add `"credentialsSource": "local"` under the relevant profiles in `eas.json`. Prefer Expo-hosted credentials for shared/CI builds.

**Rules:** Google Play `versionCode` must always increase; **upload key** mismatches are unrelated to `versionCode` — fix credentials first, then rebuild the `.aab`.

## Get the .aab from EAS

1. Go to [expo.dev](https://expo.dev) → Your project → **Builds**
2. Find the completed Android build
3. Click the build → **Download** or copy the **Artifact URL**
4. The artifact is the `.aab` file

Or via CLI:

```bash
eas build:list --platform android --limit 1
```

Then download:

```bash
eas build:download --platform android --latest
```

## Upload to Google Play Internal Testing

1. Go to [Google Play Console](https://play.google.com/console)
2. Select your app (or create it)
3. **Testing** → **Internal testing** → **Create new release**
4. Upload the `.aab` file
5. Add release notes and roll out

## Quick Reference

| Step              | Command / Action                                      |
|-------------------|-------------------------------------------------------|
| Build AAB         | `eas build --platform android --profile play`         |
| List builds       | `eas build:list --platform android`                   |
| Download latest   | `eas build:download --platform android --latest`      |
| versionCode       | EAS remote + `autoIncrement` on `play` / `production` |

## Troubleshooting

- **Build fails**: Check EAS build logs; ensure secrets are set
- **versionCode conflict**: verify remote versioning is enabled and rebuild with `play` or `production` (both auto-increment)
- **Missing package**: Ensure `app.json` has `expo.android.package` (e.g. `com.godskid.golfsocietyhub`)
- **Wrong backend**: Verify EAS Secrets point to TEST for play profile; check Settings footer for "Environment: TEST"
- **Wrong signing key / certificate fingerprint**: EAS upload keystore does not match Play’s registered upload certificate — follow **Play upload signing key (EAS)** above, then run a new `eas build`
