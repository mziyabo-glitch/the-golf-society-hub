import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { db, auth } from '../lib/firebase';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { setActiveSocietyId } from './_layout';

export default function CreateSocietyScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [homeCourse, setHomeCourse] = useState('');
  const [country, setCountry] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreateSociety = async () => {
    if (!auth.currentUser) {
      Alert.alert('Error', 'You must be signed in to create a society');
      return;
    }

    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a society name');
      return;
    }

    setSubmitting(true);

    try {
      // Create the society
      const societiesRef = collection(db, 'societies');
      const societyDoc = await addDoc(societiesRef, {
        name: name.trim(),
        homeCourse: homeCourse.trim() || null,
        country: country.trim() || null,
        captainId: auth.currentUser.uid,
        createdAt: new Date(),
      });

      console.log('✓ Society created:', societyDoc.id);

      // Set as active society in user profile
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        activeSocietyId: societyDoc.id,
      });

      // Update in-memory cache
      setActiveSocietyId(societyDoc.id);

      console.log('✓ Active society set to:', societyDoc.id);

      Alert.alert('Success', 'Society created successfully!', [
        {
          text: 'OK',
          onPress: () => router.replace('/'),
        },
      ]);
    } catch (error) {
      console.error('✗ Failed to create society:', error);
      Alert.alert('Error', 'Failed to create society. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Create Your Society</Text>
        <Text style={styles.subtitle}>
          This creates your society online and makes you Captain/Admin.
        </Text>

        <Text style={styles.label}>Society name *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., M4"
          placeholderTextColor="#999999"
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>Home course (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Wrag Barn"
          placeholderTextColor="#999999"
          value={homeCourse}
          onChangeText={setHomeCourse}
        />

        <Text style={styles.label}>Country</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., UK"
          placeholderTextColor="#999999"
          value={country}
          onChangeText={setCountry}
        />

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleCreateSociety}
          disabled={submitting}
        >
          <Text style={styles.submitButtonText}>
            {submitting ? 'Creating...' : 'Create Society'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
          disabled={submitting}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 24,
    lineHeight: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: '#000000',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 32,
  },
  submitButtonDisabled: {
    backgroundColor: '#B0B0B0',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cancelButton: {
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  cancelButtonText: {
    color: '#666666',
    fontSize: 16,
  },
});
