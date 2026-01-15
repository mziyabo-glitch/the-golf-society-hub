import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

let activeSocietyIdCache: string | null = null;

export function getActiveSocietyId(): string | null {
  return activeSocietyIdCache;
}

export function setActiveSocietyId(id: string | null) {
  activeSocietyIdCache = id;
}

async function ensureSignedIn() {
  if (auth.currentUser) {
    console.log('✓ User already signed in:', auth.currentUser.uid);
    return auth.currentUser;
  }

  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (user) {
        console.log('✓ Auth restored:', user.uid);
        resolve(user);
      } else {
        console.log('⚠ No user - signing in anonymously...');
        try {
          const { signInAnonymously } = await import('firebase/auth');
          const result = await signInAnonymously(auth);
          console.log('✓ Anonymous sign-in complete:', result.user.uid);
          resolve(result.user);
        } catch (error) {
          console.error('✗ Sign-in failed:', error);
          reject(error);
        }
      }
    });
  });
}

async function initActiveSocietyId(uid: string) {
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const societyId = userSnap.data()?.activeSocietyId;
      if (societyId) {
        activeSocietyIdCache = societyId;
        console.log('✓ Active society loaded:', societyId);
        return;
      }
    }

    // Create user profile if missing
    await setDoc(userRef, { activeSocietyId: null }, { merge: true });
    activeSocietyIdCache = null;
    console.log('✓ User profile initialized');
  } catch (error) {
    console.error('✗ Failed to init society ID:', error);
    activeSocietyIdCache = null;
  }
}

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        console.log('🔄 Initializing app...');
        
        // Wait for auth to be ready
        const user = await ensureSignedIn();
        
        if (!mounted) return;

        // Load active society
        await initActiveSocietyId(user.uid);

        if (mounted) {
          setIsReady(true);
          console.log('✓ App initialized successfully');
        }
      } catch (err) {
        console.error('✗ Initialization failed:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to initialize');
        }
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <Text style={styles.errorSubtext}>Please refresh the page</Text>
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading The Golf Society Hub...</Text>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#007AFF' },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: 'bold', color: '#FFFFFF' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Dashboard' }} />
      <Stack.Screen name="societies" options={{ title: 'My Societies' }} />
      <Stack.Screen name="members" options={{ title: 'Members' }} />
      <Stack.Screen name="create-event" options={{ title: 'Create Event' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#000000',
    fontWeight: '500',
  },
  errorText: {
    fontSize: 18,
    color: '#FF3B30',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 14,
    color: '#000000',
  },
});
