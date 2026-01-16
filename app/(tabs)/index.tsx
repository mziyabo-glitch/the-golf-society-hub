import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.scrollView}>
      <View style={styles.container}>
        <Text style={styles.title}>Welcome to Golf Society Hub</Text>
        <Text style={styles.subtitle}>Manage your golf societies with ease</Text>
        
        <View style={styles.menuGrid}>
          <TouchableOpacity 
            style={styles.menuCard}
            onPress={() => router.push('/societies')}
          >
            <Text style={styles.menuIcon}>⛳</Text>
            <Text style={styles.menuTitle}>Societies</Text>
            <Text style={styles.menuDescription}>Browse and join societies</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuCard}
            onPress={() => router.push('/(tabs)/events')}
          >
            <Text style={styles.menuIcon}>📅</Text>
            <Text style={styles.menuTitle}>Events</Text>
            <Text style={styles.menuDescription}>View upcoming events</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuCard}
            onPress={() => router.push('/(tabs)/leaderboard')}
          >
            <Text style={styles.menuIcon}>🏆</Text>
            <Text style={styles.menuTitle}>Leaderboard</Text>
            <Text style={styles.menuDescription}>Check rankings</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuCard}
            onPress={() => router.push('/(tabs)/finances')}
          >
            <Text style={styles.menuIcon}>💰</Text>
            <Text style={styles.menuTitle}>Finances</Text>
            <Text style={styles.menuDescription}>Track expenses</Text>
          </TouchableOpacity>
        </View>
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
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  menuCard: {
    backgroundColor: '#fff',
    width: '48%',
    padding: 20,
    borderRadius: 12,
    marginBottom: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  menuIcon: {
    fontSize: 40,
    marginBottom: 10,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  menuDescription: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
});
