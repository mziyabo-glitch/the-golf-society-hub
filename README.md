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

## Learn more

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Expo Web documentation](https://docs.expo.dev/workflow/web/): Learn about building web apps with Expo.
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.
- [Vercel documentation](https://vercel.com/docs): Learn about deploying to Vercel.

## Join the community

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
