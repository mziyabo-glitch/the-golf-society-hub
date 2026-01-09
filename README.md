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

## Web Deployment

### Building for Web

To build the web version locally:

```bash
npm run build:web
```

This will output static files to the `dist/` folder.

### Deploying to Vercel

This project is configured for deployment to Vercel using Expo Web (static export).

#### Option 1: Deploy via Vercel Dashboard (Recommended)

1. Push your code to a GitHub/GitLab/Bitbucket repository
2. Go to [vercel.com](https://vercel.com) and sign in
3. Click "Add New Project"
4. Import your repository
5. Vercel will automatically detect the `vercel.json` configuration
6. Click "Deploy"

The `vercel.json` file is pre-configured with:
- Build command: `npx expo export --platform web`
- Output directory: `dist`
- `cleanUrls: true` - Serves `.html` files without extensions (fixes 404 on refresh)
- Dynamic route rewrites for `/event/[id]` paths
- SPA fallback rewrites for client-side routing
- Cache headers for static assets

#### Option 2: Deploy via Vercel CLI

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy:
   ```bash
   vercel
   ```

4. For production deployment:
   ```bash
   vercel --prod
   ```

### Manual Steps in Vercel UI

If you need to configure manually in the Vercel dashboard:

1. **Framework Preset**: Select "Other"
2. **Build Command**: `npx expo export --platform web`
3. **Output Directory**: `dist`
4. **Install Command**: `npm install`

### Environment Variables

No environment variables are required for basic deployment. If you add backend services, configure them in the Vercel dashboard under Project Settings > Environment Variables.

### Custom Domain

1. Go to your project in the Vercel dashboard
2. Navigate to Settings > Domains
3. Add your custom domain and follow the DNS configuration instructions

## Order of Merit (OOM) System

The Order of Merit tracks player rankings across events in a season.

### Points Mapping

Points are awarded using F1-style scoring:

| Position | Points |
|----------|--------|
| 1st      | 25     |
| 2nd      | 18     |
| 3rd      | 15     |
| 4th      | 12     |
| 5th      | 10     |
| 6th      | 8      |
| 7th      | 6      |
| 8th      | 4      |
| 9th      | 2      |
| 10th     | 1      |
| 11th+    | 0      |

### OOM Rules

- Only **published** event results count toward OOM
- Draft results do not affect the leaderboard
- Filter by season year (defaults to current year)
- Filter by OOM events only (events marked as `isOOM: true`)
- Only members with points > 0 are displayed
- Tie-breaker: Points desc → Wins desc → Events played asc → Name asc

### Computation

OOM is computed using `lib/oom.ts`:

```typescript
import { computeOrderOfMerit } from "@/lib/oom";

const results = computeOrderOfMerit({
  events,
  members,
  seasonYear: 2026,
  oomOnly: true, // Only count OOM-flagged events
});
```

## Tee Sheet Export

The tee sheet can be exported to PDF on both web and mobile platforms.

### Web Export

On web (Expo Web / Vercel deployment):
1. Click "Print / Download PDF" button
2. App navigates to a dedicated print route (`/print/tee-sheet?eventId=...`)
3. The tee sheet HTML renders in the browser
4. Browser print dialog appears automatically (or use Ctrl+P / Cmd+P)
5. Select "Save as PDF" in the print destination

The print route approach is more reliable than popup windows because:
- No popup blocker issues
- Consistent rendering across browsers
- Better print preview experience
- "Print Again" button available if needed

The export includes:
- App branding: "Produced by The Golf Society Hub"
- Society logo (if configured)
- ManCo details: Captain, Secretary, Treasurer, Handicapper
- Nearest to Pin and Longest Drive hole designations
- Full tee time schedule with player handicaps
- Tee sheet notes

### Mobile Export (iOS/Android)

On native platforms:
1. Click "Share PDF" button
2. `expo-print` generates a PDF file
3. `expo-sharing` opens the share sheet
4. Save to Files, email, or share via apps

## Testing

### Stress Test

Simulates 100 societies with 20 members and 12 events each:

```bash
npm run test:stress
```

This verifies:
- OOM computation completes quickly (<5 seconds total)
- No crashes with large datasets
- Memory efficiency

### Smoke Tests (Playwright)

End-to-end tests for web deployment:

```bash
# Run smoke tests (starts Expo web server automatically)
npm run test:smoke

# Run with visible browser
npm run test:smoke:headed
```

Tests verify:
- App loads without crashing
- Navigation works
- Key screens render (leaderboard, tee sheet, events)
- Export triggers window.print path
- Error boundary catches errors gracefully

### Running Tests in CI

```bash
# Install Playwright browsers (first time)
npx playwright install chromium

# Run tests with CI-friendly settings
CI=true npm run test:smoke
```

## Error Handling

The app includes an ErrorBoundary that catches JavaScript errors and displays a friendly fallback:

- Wraps the entire app in `app/_layout.tsx`
- Shows "Something went wrong" message instead of white screen
- Provides "Try Again" button to recover
- In development, shows error details and stack trace

## Firestore Security Rules

The app uses Firebase Firestore with proper security rules. See `firestore.rules` for the full implementation.

### Deploying Security Rules

Deploy security rules to Firebase:

```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools

# Login to Firebase
firebase login

# Deploy only Firestore rules
firebase deploy --only firestore:rules
```

### Security Rule Summary

| Collection | Read | Create | Update | Delete |
|------------|------|--------|--------|--------|
| `societies/{societyId}` | Members only | Any authenticated | Captain/Admin | Captain/Admin |
| `societies/{societyId}/members/{memberId}` | Members only | Captain/Admin/Secretary | Self (own profile, not roles) or Captain/Admin/Secretary | Captain/Admin/Secretary |
| `societies/{societyId}/events/{eventId}` | Members only | Captain/Admin | Captain/Admin/Handicapper | Captain/Admin |
| `societies/{societyId}/courses/{courseId}` | Members only | Captain/Admin | Captain/Admin | Captain/Admin |
| `societies/{societyId}/teesets/{teeSetId}` | Members only | Captain/Admin | Captain/Admin | Captain/Admin |

### Key Security Concepts

- **Authentication Required**: All reads/writes require Firebase Auth sign-in
- **Membership Verification**: Users must be members of a society to access its data
- **Role-Based Access**: Roles (captain, admin, treasurer, secretary, handicapper) control write permissions
- **Self-Profile Updates**: Members can update their own profile fields (name, handicap, email) but not their roles
- **Member Document ID**: Member documents should be keyed by `auth.uid` for security rule verification

### Helper Functions in Rules

- `isSignedIn()` - Check if user is authenticated
- `isSocietyMember(societyId)` - Check if user is a member of the society
- `hasRole(societyId, roleName)` - Check if user has a specific role
- `isAdminOrCaptain(societyId)` - Check for admin/captain privileges
- `isSelf(memberId)` - Check if the document ID matches the user's auth UID
- `onlyUpdatingSelfFields()` - Validate self-profile updates don't include roles

## Learn more

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Expo Web documentation](https://docs.expo.dev/workflow/web/): Learn about building web apps with Expo.
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.
- [Vercel documentation](https://vercel.com/docs): Learn about deploying to Vercel.

## Join the community

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
