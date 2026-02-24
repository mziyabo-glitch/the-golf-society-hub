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

## Bump versionCode

The `play` profile has `autoIncrement: true`, so **versionCode is incremented automatically** on each build.

To bump manually:

1. Edit `app.json` → `expo.android.versionCode` (integer)

For each new Play Store upload, `versionCode` must be greater than the previous upload.

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
| Bump versionCode  | Edit `app.json` or rely on `autoIncrement`            |

## Troubleshooting

- **Build fails**: Check EAS build logs; ensure secrets are set
- **versionCode conflict**: Increment `versionCode` in `app.json` and rebuild
- **Missing package**: Ensure `app.json` has `expo.android.package` (e.g. `com.godskid.golfsocietyhub`)
- **Wrong backend**: Verify EAS Secrets point to TEST for play profile; check Settings footer for "Environment: TEST"
