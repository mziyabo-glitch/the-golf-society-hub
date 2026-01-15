import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { db } from '../../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { useActiveSociety } from '../../hooks/useActiveSociety';

interface LeaderboardEntry {
  id: string;
  name: string;
  handicap: number;
  eventsPlayed: number;
  wins: number;
  totalPoints: number;
}

export default function LeaderboardScreen() {
  const router = useRouter();
  const { societyId, loading: societyLoading } = useActiveSociety();
  
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (societyLoading) return;
    
    if (!societyId) {
      setLoading(false);
      return;
    }

    async function loadLeaderboard() {
      try {
        console.log('🏆 Loading leaderboard for society:', societyId);

        // Load all members
        const membersRef = collection(db, 'societies', societyId, 'members');
        const membersSnap = await getDocs(membersRef);
        
        // For now, just show members with their handicaps
        // TODO: Calculate actual points from event results
        const entries: LeaderboardEntry[] = membersSnap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.displayName,
            handicap: data.handicap,
            eventsPlayed: 0, // TODO: Calculate from events
            wins: 0, // TODO: Calculate from event results
            totalPoints: 0, // TODO: Calculate from event results
          };
        });

        // Sort by handicap for now (lower is better)
        entries.sort((a, b) => a.handicap - b.handicap);

        setLeaderboard(entries);
        console.log('✓ Leaderboard loaded:', entries.length, 'entries');
      } catch (error) {
        console.error('✗ Failed to load leaderboard:', error);
      } finally {
        setLoading(false);
      }
    }

    loadLeaderboard();
  }, [societyId, societyLoading]);

  // Loading state
  if (societyLoading || loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading leaderboard...</Text>
      </View>
    );
  }

  // No active society
  if (!societyId) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyIcon}>⛳</Text>
        <Text style={styles.emptyText}>No Active Society</Text>
        <Text style={styles.emptySubtext}>Please select or create a society first</Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/society/create')}
        >
          <Text style={styles.primaryButtonText}>Create Society</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>Leaderboard</Text>
        <Text style={styles.headerSubtext}>Season Rankings</Text>
      </View>

      {/* Leaderboard List */}
      {leaderboard.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🏆</Text>
          <Text style={styles.emptyText}>No Data Yet</Text>
          <Text style={styles.emptySubtext}>
            Add members and complete events to see rankings
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/members/add')}
          >
            <Text style={styles.primaryButtonText}>Add Members</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={leaderboard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => {
            const position = index + 1;
            let medalEmoji = '';
            if (position === 1) medalEmoji = '🥇';
            else if (position === 2) medalEmoji = '🥈';
            else if (position === 3) medalEmoji = '🥉';
            
            return (
              <View style={[
                styles.leaderboardCard,
                position <= 3 && styles.leaderboardCardTop
              ]}>
                <View style={styles.leaderboardPosition}>
                  {medalEmoji ? (
                    <Text style={styles.medalEmoji}>{medalEmoji}</Text>
                  ) : (
                    <Text style={styles.positionText}>#{position}</Text>
                  )}
                </View>
                
                <View style={styles.leaderboardInfo}>
                  <Text style={styles.leaderboardName}>{item.name}</Text>
                  <Text style={styles.leaderboardStats}>
                    HCP: {item.handicap} • Events: {item.eventsPlayed} • Wins: {item.wins}
                  </Text>
                </View>
                
                <View style={styles.leaderboardPoints}>
                  <Text style={styles.pointsNumber}>{item.totalPoints}</Text>
                  <Text style={styles.pointsLabel}>pts</Text>
                </View>
              </View>
            );
          }}
          ListFooterComponent={
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                💡 Rankings will update as events are completed
              </Text>
            </View>
          }
        />
      )}
    </View>
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
  header: {
    backgroundColor: '#007AFF',
    padding: 24,
    alignItems: 'center',
  },
  headerText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtext: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#000000',
  },
  listContent: {
    padding: 16,
  },
  leaderboardCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  leaderboardCardTop: {
    borderColor: '#FFD700',
    borderWidth: 2,
  },
  leaderboardPosition: {
    width: 50,
    alignItems: 'center',
    marginRight: 12,
  },
  medalEmoji: {
    fontSize: 32,
  },
  positionText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#666666',
  },
  leaderboardInfo: {
    flex: 1,
  },
  leaderboardName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 4,
  },
  leaderboardStats: {
    fontSize: 12,
    color: '#666666',
  },
  leaderboardPoints: {
    alignItems: 'center',
    minWidth: 60,
  },
  pointsNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  pointsLabel: {
    fontSize: 12,
    color: '#666666',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
