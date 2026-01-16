import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/config/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

export default function HomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [societies, setSocieties] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        await fetchUserSocieties(currentUser.uid);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const fetchUserSocieties = async (userId: string) => {
    try {
      const societiesRef = collection(db, 'societies');
      const q = query(
        societiesRef,
        where('members', 'array-contains', userId)
      );
      
      const querySnapshot = await getDocs(q);
      const userSocieties = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setSocieties(userSocieties);
    } catch (error) {
      console.error('Error fetching societies:', error);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Welcome to Golf Society Hub</Text>
        <Text style={styles.subtitle}>Please sign in to continue</Text>
        <TouchableOpacity 
          style={styles.button}
          onPress={() => router.push('/login')}
        >
          <Text style={styles.buttonText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.scrollView}>
      <View style={styles.container}>
        <Text style={styles.title}>My Societies</Text>
        
        {societies.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No societies found</Text>
            <TouchableOpacity 
              style={styles.button}
              onPress={() => router.push('/societies')}
            >
              <Text style={styles.buttonText}>Browse Societies</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.societiesList}>
            {societies.map((society) => (
              <TouchableOpacity
                key={society.id}
                style={styles.societyCard}
                onPress={() => router.push(`/society?id=${society.id}`)}
              >
                <Text style={styles.societyName}>{society.name}</Text>
                <Text style={styles.societyDescription}>
                  {society.description || 'No description'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 50,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  societiesList: {
    marginTop: 20,
  },
  societyCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  societyName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  societyDescription: {
    fontSize: 14,
    color: '#666',
  },
});
