# Google Play Internal Testing – Release Checklist

## Prerequisites

1. **EAS CLI** installed: `npm install -g eas-cli`
2. **Expo account** linked: `eas login`
3. **Project configured**: `eas build:configure` (if not already done)
4. **EAS Secrets** set in [expo.dev](https://expo.dev) → Project → Secrets:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`

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
