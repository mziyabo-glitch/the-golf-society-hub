import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { db, auth } from '../lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { setActiveSocietyId, getActiveSocietyId } from './_layout';

interface Society {
  id: string;
  name: string;
  homeCourse?: string;
  country?: string;
  captainId: string;
  createdAt: Date;
}

export default function SocietiesScreen() {
  const router = useRouter();
  const [societies, setSocieties] = useState<Society[]>([]);
  const [loading, setLoading] = useState(true);
  const activeSocietyId = getActiveSocietyId();

  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    console.log('📋 Loading societies for user:', auth.currentUser.uid);

    const societiesRef = collection(db, 'societies');
    const q = query(societiesRef, where('captainId', '==', auth.currentUser.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const societiesList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
        })) as Society[];

        console.log('✓ Societies loaded:', societiesList.length);
        setSocieties(societiesList);
        setLoading(false);
      },
      (error) => {
        console.error('✗ Failed to load societies:', error);
        Alert.alert('Error', 'Failed to load societies');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleSelectSociety = async (society: Society) => {
    try {
      // Update in Firestore
      await updateDoc(doc(db, 'users', auth.currentUser!.uid), {
        activeSocietyId: society.id,
      });

      // Update in memory
      setActiveSocietyId(society.id);

      console.log('✓ Active society set to:', society.name);
      Alert.alert('Success', `Switched to ${society.name}`, [
        {
          text: 'OK',
          onPress: () => router.push('/'),
        },
      ]);
    } catch (error) {
      console.error('✗ Failed to set active society:', error);
      Alert.alert('Error', 'Failed to switch society');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading societies...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>My Societies</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push('/create-society')}
        >
          <Text style={styles.createButtonText}>+ Create New</Text>
        </TouchableOpacity>
      </View>

      {societies.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>⛳</Text>
          <Text style={styles.emptyText}>No societies yet</Text>
          <Text style={styles.emptySubtext}>Create your first golf society to get started</Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/create-society')}
          >
            <Text style={styles.primaryButtonText}>Create Society</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={societies}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.societyCard,
                item.id === activeSocietyId && styles.activeSocietyCard,
              ]}
              onPress={() => handleSelectSociety(item)}
            >
              {item.id === activeSocietyId && (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>ACTIVE</Text>
                </View>
              )}
              <Text style={styles.societyName}>{item.name}</Text>
              {item.homeCourse && (
                <Text style={styles.societyDetail}>📍 {item.homeCourse}</Text>
              )}
              {item.country && (
                <Text style={styles.societyDetail}>🌍 {item.country}</Text>
              )}
              <Text style={styles.societyDate}>
                Created {item.createdAt.toLocaleDateString()}
              </Text>
            </TouchableOpacity>
          )}
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
  list: {
    padding: 16,
  },
  societyCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 12,
    position: 'relative',
  },
  activeSocietyCard: {
    borderColor: '#007AFF',
    borderWidth: 2,
    backgroundColor: '#F0F7FF',
  },
  activeBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#007AFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  societyName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
  },
  societyDetail: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 4,
  },
  societyDate: {
    fontSize: 12,
    color: '#999999',
    marginTop: 8,
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
