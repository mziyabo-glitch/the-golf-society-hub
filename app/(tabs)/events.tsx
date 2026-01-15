import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { useActiveSociety } from '../../hooks/useActiveSociety';
import { canCreateEvent, canEditEvent } from '../../lib/permissions';

interface Event {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  maxPlayers?: number;
  participants: string[];
  createdAt: Date;
}

export default function EventsScreen() {
  const router = useRouter();
  const { societyId, userRole, loading: societyLoading } = useActiveSociety();
  
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  const canCreate = canCreateEvent(userRole);
  const canEdit = canEditEvent(userRole);

  useEffect(() => {
    if (societyLoading) return;
    
    if (!societyId) {
      setLoading(false);
      return;
    }

    console.log('📅 Loading events for society:', societyId);

    const eventsRef = collection(db, 'societies', societyId, 'events');
    const q = query(eventsRef, orderBy('date', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const eventsList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
        })) as Event[];

        console.log('✓ Events loaded:', eventsList.length);
        setEvents(eventsList);
        setLoading(false);
      },
      (error) => {
        console.error('✗ Failed to load events:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [societyId, societyLoading]);

  // Loading state
  if (societyLoading || loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading events...</Text>
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
        <Text style={styles.headerText}>Events ({events.length})</Text>
        {canCreate && (
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => router.push('/events/create')}
          >
            <Text style={styles.createButtonText}>+ Create Event</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Events List */}
      {events.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📅</Text>
          <Text style={styles.emptyText}>No Events Yet</Text>
          <Text style={styles.emptySubtext}>
            {canCreate
              ? 'Create your first event to get started'
              : 'No events have been scheduled yet'}
          </Text>
          {canCreate && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push('/events/create')}
            >
              <Text style={styles.primaryButtonText}>Create First Event</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const eventDate = new Date(item.date);
            const isPast = eventDate < new Date();
            
            return (
              <TouchableOpacity
                style={[styles.eventCard, isPast && styles.eventCardPast]}
                onPress={() => router.push(`/events/${item.id}`)}
              >
                <View style={styles.eventHeader}>
                  <Text style={styles.eventTitle}>{item.title}</Text>
                  {isPast && (
                    <View style={styles.pastBadge}>
                      <Text style={styles.pastBadgeText}>Past</Text>
                    </View>
                  )}
                </View>
                
                <View style={styles.eventDetails}>
                  <Text style={styles.eventDetail}>
                    📅 {new Date(item.date).toLocaleDateString()}
                  </Text>
                  <Text style={styles.eventDetail}>🕐 {item.time}</Text>
                  <Text style={styles.eventDetail}>📍 {item.location}</Text>
                </View>
                
                <View style={styles.eventFooter}>
                  <Text style={styles.participantsText}>
                    👥 {item.participants?.length || 0}
                    {item.maxPlayers ? ` / ${item.maxPlayers}` : ''} players
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
  },
  createButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#000000',
  },
  listContent: {
    padding: 16,
  },
  eventCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 12,
  },
  eventCardPast: {
    opacity: 0.6,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    flex: 1,
  },
  pastBadge: {
    backgroundColor: '#999999',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pastBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  eventDetails: {
    marginBottom: 12,
  },
  eventDetail: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 4,
  },
  eventFooter: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 12,
  },
  participantsText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
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
