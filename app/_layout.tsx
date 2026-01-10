import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View, ScrollView } from 'react-native';
import { 
  assertFirebaseConfigured, 
  initActiveSocietyId, 
  ensureSignedIn, 
  waitForAuthState,
  getFirebaseConfigStatus,
  type AuthStatus,
} from '@/lib/firebase';

export const unstable_settings = {
  anchor: '(tabs)',
};

/**
 * Startup error info for displaying to user
 */
interface StartupError {
  type: 'config' | 'auth' | 'society' | 'unknown';
  title: string;
  body: string;
  details?: string;
  missingVars?: string[];
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [startupError, setStartupError] = useState<StartupError | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('initializing');

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        // Check Firebase config status first (detailed validation)
        const configStatus = getFirebaseConfigStatus();
        
        if (!configStatus.configured) {
          console.error('[RootLayout] Firebase config validation failed:', {
            missingVars: configStatus.missingVars,
            usingDummyConfig: configStatus.usingDummyConfig,
          });
          
          if (isMounted) {
            setStartupError({
              type: 'config',
              title: 'Firebase Configuration Missing',
              body: 'This deployment is missing required Firebase environment variables.',
              details: configStatus.usingDummyConfig 
                ? 'Using dummy/placeholder configuration which is not valid for production.'
                : undefined,
              missingVars: configStatus.missingVars,
            });
          }
          return;
        }

        // Initialize Firebase Auth - wait for auth state to be ready
        await waitForAuthState();
        
        // Try to sign in (does NOT throw on failure)
        const signInResult = await ensureSignedIn();
        
        if (isMounted) {
          setAuthStatus(signInResult.status);
        }
        
        // Handle auth failures gracefully
        if (!signInResult.success) {
          console.warn('[RootLayout] Auth bootstrap failed, but continuing...', {
            status: signInResult.status,
            error: signInResult.error,
          });
          
          if (signInResult.status === 'needsLogin') {
            // Set error state but DON'T block the app - let screens handle auth
            if (isMounted) {
              setStartupError({
                type: 'auth',
                title: 'Sign-in Unavailable',
                body: 'Anonymous authentication is not available. Please enable Anonymous auth in Firebase Console or wait for login to be implemented.',
                details: signInResult.error 
                  ? `Error: ${signInResult.error.code} - ${signInResult.error.message}`
                  : undefined,
              });
            }
            return;
          }
          
          if (signInResult.status === 'configError') {
            if (isMounted) {
              setStartupError({
                type: 'config',
                title: 'Firebase Configuration Error',
                body: signInResult.error?.message || 'Invalid Firebase configuration.',
              });
            }
            return;
          }
        }

        // Guard active society id (async initialization)
        const societyId = await initActiveSocietyId();
        if (!societyId && process.env.NODE_ENV === 'production') {
          console.warn('[RootLayout] No active society ID in production');
          // Don't block - let the app load and screens will handle it
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error('[RootLayout] Unexpected startup error:', e);
        
        if (isMounted) {
          // Handle legacy error types
          if (message === 'FIREBASE_NOT_CONFIGURED') {
            const configStatus = getFirebaseConfigStatus();
            setStartupError({
              type: 'config',
              title: 'Firebase not configured',
              body: 'This deployment is missing Firebase environment variables.',
              missingVars: configStatus.missingVars,
            });
          } else if (message === 'MISSING_ACTIVE_SOCIETY_ID') {
            setStartupError({
              type: 'society',
              title: 'No Society Selected',
              body: 'Please select or create a society to continue.',
            });
          } else {
            setStartupError({
              type: 'unknown',
              title: 'Startup Error',
              body: 'Something went wrong during app initialization.',
              details: message,
            });
          }
        }
      }
    };

    void init();
    return () => {
      isMounted = false;
    };
  }, []);

  // Web-only friendly error screen (avoid white-screen / ErrorBoundary)
  if (startupError && Platform.OS === 'web') {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <ScrollView 
          contentContainerStyle={{ alignItems: 'center', padding: 20 }}
          style={{ maxWidth: 500 }}
        >
          <Text style={{ fontSize: 24, marginBottom: 8 }}>
            {startupError.type === 'config' ? '⚙️' : startupError.type === 'auth' ? '🔐' : '⚠️'}
          </Text>
          <Text style={{ fontSize: 20, fontWeight: '800', marginBottom: 10, textAlign: 'center' }}>
            {startupError.title}
          </Text>
          <Text style={{ fontSize: 14, opacity: 0.75, textAlign: 'center', marginBottom: 12 }}>
            {startupError.body}
          </Text>
          
          {startupError.details && (
            <Text style={{ fontSize: 12, opacity: 0.5, textAlign: 'center', marginBottom: 12, fontFamily: 'monospace' }}>
              {startupError.details}
            </Text>
          )}
          
          {startupError.missingVars && startupError.missingVars.length > 0 && (
            <View style={{ backgroundColor: '#f9fafb', padding: 12, borderRadius: 8, marginBottom: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', marginBottom: 6 }}>Missing Environment Variables:</Text>
              {startupError.missingVars.map((v) => (
                <Text key={v} style={{ fontSize: 11, fontFamily: 'monospace', color: '#dc2626' }}>
                  • {v}
                </Text>
              ))}
            </View>
          )}
          
          {startupError.type === 'auth' && (
            <View style={{ backgroundColor: '#fef3c7', padding: 12, borderRadius: 8, marginBottom: 12 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', marginBottom: 4 }}>How to fix:</Text>
              <Text style={{ fontSize: 11, lineHeight: 18 }}>
                1. Go to Firebase Console → Authentication → Sign-in method{'\n'}
                2. Enable "Anonymous" authentication{'\n'}
                3. Redeploy or reload the app
              </Text>
            </View>
          )}
          
          <Pressable
            onPress={() => {
              if (typeof window !== 'undefined') window.location.reload();
            }}
            style={{ backgroundColor: '#0B6E4F', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, marginTop: 8 }}
          >
            <Text style={{ color: 'white', fontWeight: '700' }}>Reload</Text>
          </Pressable>
        </ScrollView>
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
