import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { getActiveSocietyId } from './_layout';
import { useEffect, useState } from 'react';
import { db, auth } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function DashboardScreen() {
  const router = useRouter();
  const [societyName, setSocietyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const societyId = getActiveSocietyId();

  useEffect(() => {
    if (!societyId) {
      setLoading(false);
      return;
    }

    async function loadSociety() {
      try {
        const societyDoc = await getDoc(doc(db, 'societies', societyId));
        if (societyDoc.exists()) {
          setSocietyName(societyDoc.data().name);
        }
      } catch (error) {
        console.error('Failed to load society:', error);
      } finally {
        setLoading(false);
      }
    }

    loadSociety();
  }, [societyId]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!societyId) {
    return (
      <View style={styles.container}>
        <View style={styles.welcomeCard}>
          <Text style={styles.welcomeTitle}>Welcome to Golf Society Hub</Text>
          <Text style={styles.welcomeText}>
            Get started by creating your first society or joining an existing one.
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/create-society')}
          >
            <Text style={styles.primaryButtonText}>Create Society</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/societies')}
          >
            <Text style={styles.secondaryButtonText}>View My Societies</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {societyName || 'Golf Society Hub'}
        </Text>
        <Text style={styles.headerSubtitle}>Captain Dashboard</Text>
      </View>

      <View style={styles.grid}>
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push('/members')}
        >
          <Text style={styles.cardIcon}>👥</Text>
          <Text style={styles.cardTitle}>Members</Text>
          <Text style={styles.cardDescription}>Manage your society members</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push('/create-event')}
        >
          <Text style={styles.cardIcon}>📅</Text>
          <Text style={styles.cardTitle}>Create Event</Text>
          <Text style={styles.cardDescription}>Schedule a new golf event</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push('/societies')}
        >
          <Text style={styles.cardIcon}>⛳</Text>
          <Text style={styles.cardTitle}>My Societies</Text>
          <Text style={styles.cardDescription}>Switch between societies</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => alert('Coming soon!')}
        >
          <Text style={styles.cardIcon}>📊</Text>
          <Text style={styles.cardTitle}>Leaderboard</Text>
          <Text style={styles.cardDescription}>View rankings</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>User ID: {auth.currentUser?.uid.slice(0, 8)}...</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    fontSize: 16,
    color: '#000000',
    textAlign: 'center',
    marginTop: 50,
  },
  welcomeCard: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 12,
    textAlign: 'center',
  },
  welcomeText: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 24,
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 24,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  grid: {
    padding: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    backgroundColor: '#FFFFFF',
    width: '48%',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 16,
    alignItems: 'center',
  },
  cardIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
    textAlign: 'center',
  },
  cardDescription: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  footer: {
    padding: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#999999',
  },
});
