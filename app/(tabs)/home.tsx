import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { db } from '../../lib/firebase';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { useActiveSociety } from '../../hooks/useActiveSociety';
import { canCreateEvent, canAddMember, canManageFinances } from '../../lib/permissions';

interface DashboardStats {
  membersCount: number;
  upcomingEventsCount: number;
  recentEventsCount: number;
}

export default function HomeScreen() {
  const router = useRouter();
  const { societyId, society, userRole, loading: societyLoading } = useActiveSociety();
  
  const [stats, setStats] = useState<DashboardStats>({
    membersCount: 0,
    upcomingEventsCount: 0,
    recentEventsCount: 0,
  });
  const [loading, setLoading] = useState(true);

  const canCreate = canCreateEvent(userRole);
  const canAdd = canAddMember(userRole);
  const canFinances = canManageFinances(userRole);

  useEffect(() => {
    if (societyLoading) return;
    
    if (!societyId) {
      setLoading(false);
      return;
    }

    async function loadStats() {
      try {
        const membersRef = collection(db, 'societies', societyId, 'members');
        const membersSnap = await getDocs(membersRef);
        
        const now = new Date();
        const eventsRef = collection(db, 'societies', societyId, 'events');
        const upcomingQuery = query(
          eventsRef,
          where('date', '>=', now.toISOString().split('T')[0]),
          orderBy('date', 'asc'),
          limit(10)
        );
        const upcomingSnap = await getDocs(upcomingQuery);
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentQuery = query(
          eventsRef,
          where('date', '>=', thirtyDaysAgo.toISOString().split('T')[0]),
          where('date', '<', now.toISOString().split('T')[0]),
          orderBy('date', 'desc'),
          limit(5)
        );
        const recentSnap = await getDocs(recentQuery);

        setStats({
          membersCount: membersSnap.size,
          upcomingEventsCount: upcomingSnap.size,
          recentEventsCount: recentSnap.size,
        });
        
        console.log('✓ Dashboard stats loaded');
      } catch (error) {
        console.error('✗ Failed to load dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, [societyId, societyLoading]);

  if (societyLoading || loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  if (!societyId) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.welcomeIcon}>⛳</Text>
        <Text style={styles.welcomeTitle}>Welcome to Golf Society Hub</Text>
        <Text style={styles.welcomeText}>
          Get started by creating your first society or joining an existing one.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/society/create')}
        >
          <Text style={styles.primaryButtonText}>Create Society</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/society/switch')}
        >
          <Text style={styles.secondaryButtonText}>View My Societies</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{society?.name || 'Golf Society Hub'}</Text>
          <Text style={styles.headerSubtitle}>
            {userRole ? `${userRole} Dashboard` : 'Dashboard'}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.switchButton}
          onPress={() => router.push('/society/switch')}
        >
          <Text style={styles.switchButtonText}>Switch</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.membersCount}</Text>
          <Text style={styles.statLabel}>Members</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.upcomingEventsCount}</Text>
          <Text style={styles.statLabel}>Upcoming Events</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.recentEventsCount}</Text>
          <Text style={styles.statLabel}>Recent Events</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          {canAdd && (
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/members/add')}
            >
              <Text style={styles.actionIcon}>➕</Text>
              <Text style={styles.actionTitle}>Add Member</Text>
            </TouchableOpacity>
          )}
          
          {canCreate && (
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/events/create')}
            >
              <Text style={styles.actionIcon}>📅</Text>
              <Text style={styles.actionTitle}>Create Event</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/(tabs)/members')}
          >
            <Text style={styles.actionIcon}>👥</Text>
            <Text style={styles.actionTitle}>View Members</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/(tabs)/leaderboard')}
          >
            <Text style={styles.actionIcon}>🏆</Text>
            <Text style={styles.actionTitle}>Leaderboard</Text>
          </TouchableOpacity>
          
          {canFinances && (
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/(tabs)/finances')}
            >
              <Text style={styles.actionIcon}>💰</Text>
              <Text style={styles.actionTitle}>Finances</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/(tabs)/settings')}
          >
            <Text style={styles.actionIcon}>⚙️</Text>
            <Text style={styles.actionTitle}>Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#000000',
  },
  welcomeIcon: {
    fontSize: 72,
    marginBottom: 24,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 12,
    textAlign: 'center',
  },
  welcomeText: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    marginBottom: 12,
    width: '80%',
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
    paddingHorizontal: 32,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#007AFF',
    width: '80%',
  },
  secondaryButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  header: {
    backgroundColor: '#007AFF',
    padding: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  switchButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  switchButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  statsGrid: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666666',
    textAlign: 'center',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 16,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    backgroundColor: '#FFFFFF',
    width: '47%',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  actionIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    textAlign: 'center',
  },
});
