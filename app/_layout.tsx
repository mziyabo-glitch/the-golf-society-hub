import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { assertFirebaseConfigured, initActiveSocietyId, ensureSignedIn, waitForAuthState } from '@/lib/firebase';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fatalConfigError, setFatalConfigError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        // Guard firebase config in production (throws controlled error)
        assertFirebaseConfigured();

        // Initialize Firebase Auth - wait for auth state to be ready
        // Then sign in anonymously if not already signed in
        await waitForAuthState();
        await ensureSignedIn();

        // Guard active society id (async initialization)
        const societyId = await initActiveSocietyId();
        if (!societyId && process.env.NODE_ENV === 'production') {
          throw new Error('MISSING_ACTIVE_SOCIETY_ID');
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('[RootLayout] Fatal configuration error:', e);
        if (isMounted) setFatalConfigError(message);
      }
    };

    void init();
    return () => {
      isMounted = false;
    };
  }, []);

  // Web-only friendly config error screen (avoid white-screen)
  if (fatalConfigError && Platform.OS === 'web') {
    const title =
      fatalConfigError === 'FIREBASE_NOT_CONFIGURED'
        ? 'Firebase not configured'
        : fatalConfigError === 'MISSING_ACTIVE_SOCIETY_ID'
          ? 'No active society selected'
          : 'App configuration error';

    const body =
      fatalConfigError === 'FIREBASE_NOT_CONFIGURED'
        ? 'This deployment is missing Firebase environment variables. Please configure EXPO_PUBLIC_FIREBASE_*.'
        : fatalConfigError === 'MISSING_ACTIVE_SOCIETY_ID'
          ? 'This deployment has no active society id configured. Set EXPO_PUBLIC_DEFAULT_SOCIETY_ID or store an active society id.'
          : 'Something went wrong during startup. Please reload.';

    return (
      <View style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', marginBottom: 10 }}>{title}</Text>
        <Text style={{ fontSize: 14, opacity: 0.75, textAlign: 'center', marginBottom: 18 }}>{body}</Text>
        <Pressable
          onPress={() => {
            if (typeof window !== 'undefined') window.location.reload();
          }}
          style={{ backgroundColor: '#0B6E4F', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 }}
        >
          <Text style={{ color: 'white', fontWeight: '700' }}>Reload</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
