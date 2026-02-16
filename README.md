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
   - `EXPO_PUBLIC_SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
2. Build command: `npm run build` (includes `npm run verify-env`)
3. Output directory: `dist`

### Web icon cache notes

- Web icons are versioned (`favicon-v2.ico`, `icon-192-v2.png`, `icon-512-v2.png`, etc.) and linked from `app/+html.tsx` + `public/manifest-v2.json`.
- If a device still shows an old icon after deployment, clear site storage once (or open in incognito) to flush old OS-level favicon cache.

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

## Learn more

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
