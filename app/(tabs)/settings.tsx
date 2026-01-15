import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { auth } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import { useActiveSociety } from '../../hooks/useActiveSociety';
import { canManageSociety, isCaptain } from '../../lib/permissions';

export default function SettingsScreen() {
  const router = useRouter();
  const { societyId, society, userRole, loading } = useActiveSociety();
  
  const canManage = canManageSociety(userRole);
  const isCapt = isCaptain(userRole);

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut(auth);
              console.log('✓ User signed out');
            } catch (error) {
              console.error('✗ Sign out failed:', error);
              Alert.alert('Error', 'Failed to sign out');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

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
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Society</Text>
        
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Current Society</Text>
          <Text style={styles.infoValue}>{society?.name}</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Your Role</Text>
          <Text style={styles.infoValue}>{userRole}</Text>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/society/switch')}
        >
          <Text style={styles.buttonText}>Switch Society</Text>
        </TouchableOpacity>
      </View>

      {canManage && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Society Management</Text>
          
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push('/society/manage')}
          >
            <Text style={styles.buttonText}>Manage Society Settings</Text>
          </TouchableOpacity>

          {isCapt && (
            <TouchableOpacity
              style={styles.button}
              onPress={() => Alert.alert('Coming Soon', 'Role management feature coming soon')}
            >
              <Text style={styles.buttonText}>Manage Roles</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>User ID</Text>
          <Text style={styles.infoValue}>{auth.currentUser?.uid.slice(0, 8)}...</Text>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() => Alert.alert('Coming Soon', 'Profile settings coming soon')}
        >
          <Text style={styles.buttonText}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>App Version</Text>
          <Text style={styles.infoValue}>1.0.0</Text>
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() => Alert.alert('Help', 'Help documentation coming soon')}
        >
          <Text style={styles.buttonText}>Help & Support</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => Alert.alert('Privacy', 'Privacy policy coming soon')}
        >
          <Text style={styles.buttonText}>Privacy Policy</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.button, styles.dangerButton]}
          onPress={handleSignOut}
        >
          <Text style={[styles.buttonText, styles.dangerButtonText]}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>The Golf Society Hub</Text>
        <Text style={styles.footerSubtext}>Made with ⛳ for golfers</Text>
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
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  button: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 12,
  },
  buttonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
    textAlign: 'center',
  },
  dangerButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FF3B30',
  },
  dangerButtonText: {
    color: '#FF3B30',
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
  footer: {
    padding: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 4,
  },
  footerSubtext: {
    fontSize: 14,
    color: '#666666',
  },
});
