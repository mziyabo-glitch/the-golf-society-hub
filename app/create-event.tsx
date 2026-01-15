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
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { getActiveSocietyId } from './_layout';

export default function CreateEventScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const societyId = getActiveSocietyId();

  const handleCreateEvent = async () => {
    if (!societyId) {
      Alert.alert('Error', 'No active society selected');
      return;
    }

    // Validation
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter an event title');
      return;
    }
    if (!date.trim()) {
      Alert.alert('Error', 'Please enter an event date (YYYY-MM-DD)');
      return;
    }
    if (!time.trim()) {
      Alert.alert('Error', 'Please enter an event time (HH:MM)');
      return;
    }
    if (!location.trim()) {
      Alert.alert('Error', 'Please enter an event location');
      return;
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      Alert.alert('Error', 'Date must be in YYYY-MM-DD format (e.g., 2026-03-15)');
      return;
    }

    // Validate time format
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(time)) {
      Alert.alert('Error', 'Time must be in HH:MM format (e.g., 14:30)');
      return;
    }

    // Validate max players if provided
    let maxPlayersNum = null;
    if (maxPlayers.trim()) {
      maxPlayersNum = parseInt(maxPlayers);
      if (isNaN(maxPlayersNum) || maxPlayersNum < 1 || maxPlayersNum > 200) {
        Alert.alert('Error', 'Max players must be between 1 and 200');
        return;
      }
    }

    setSubmitting(true);

    try {
      const eventsRef = collection(db, 'societies', societyId, 'events');
      
      const eventData = {
        title: title.trim(),
        date: date.trim(),
        time: time.trim(),
        location: location.trim(),
        description: description.trim() || null,
        maxPlayers: maxPlayersNum,
        participants: [],
        createdAt: new Date(),
      };

      await addDoc(eventsRef, eventData);

      console.log('✓ Event created:', title);
      Alert.alert('Success', 'Event created successfully', [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      console.error('✗ Failed to create event:', error);
      Alert.alert('Error', 'Failed to create event. Please try again.');
      setSubmitting(false);
    }
  };

  if (!societyId) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>No active society selected</Text>
          <Text style={styles.errorSubtext}>Please select or create a society first</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.formTitle}>Event Details</Text>

        <Text style={styles.label}>Event Title *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Monthly Medal Round"
          placeholderTextColor="#999999"
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Date * (YYYY-MM-DD)</Text>
        <TextInput
          style={styles.input}
          placeholder="2026-03-15"
          placeholderTextColor="#999999"
          value={date}
          onChangeText={setDate}
        />

        <Text style={styles.label}>Time * (HH:MM)</Text>
        <TextInput
          style={styles.input}
          placeholder="14:30"
          placeholderTextColor="#999999"
          value={time}
          onChangeText={setTime}
        />

        <Text style={styles.label}>Location *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Pebble Beach Golf Links"
          placeholderTextColor="#999999"
          value={location}
          onChangeText={setLocation}
        />

        <Text style={styles.label}>Description (Optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Add any additional details about the event..."
          placeholderTextColor="#999999"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>Max Players (Optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., 24"
          placeholderTextColor="#999999"
          value={maxPlayers}
          onChangeText={setMaxPlayers}
          keyboardType="number-pad"
        />

        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleCreateEvent}
          disabled={submitting}
        >
          <Text style={styles.submitButtonText}>
            {submitting ? 'Creating...' : 'Create Event'}
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
  form: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    margin: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  formTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#000000',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
  },
});
