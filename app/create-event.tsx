import { useState } from "react";
import { View, TextInput, Text, TouchableOpacity, Alert, StyleSheet, Platform } from "react-native";
import { router } from "expo-router";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Screen } from "@/components/ui/Screen";
import { db, getActiveSocietyId } from "@/lib/firebase";

export default function CreateEventScreen() {
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!venue.trim()) return Alert.alert("Error", "Venue Name is required");

    try {
      setLoading(true);
      const societyId = getActiveSocietyId();
      if (!societyId) throw new Error("No society found");

      // Write DIRECTLY to Firestore
      await addDoc(collection(db, "societies", societyId, "events"), {
        venue: venue.trim(),
        date: date,
        createdAt: serverTimestamp(),
        status: "upcoming"
      });

      if (Platform.OS === 'web') window.alert("Event Created!");
      else Alert.alert("Success", "Event Created!");
      
      router.back();
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={{ padding: 20 }}>
        <Text style={styles.header}>Create Event</Text>
        
        <View style={styles.card}>
          <Text style={styles.label}>Venue / Course Name</Text>
          <TextInput 
            value={venue}
            onChangeText={setVenue}
            placeholder="e.g. Augusta National"
            placeholderTextColor="#999"
            style={styles.input}
          />

          <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
          <TextInput 
            value={date}
            onChangeText={setDate}
            placeholder="2026-04-10"
            placeholderTextColor="#999"
            style={styles.input}
          />

          <TouchableOpacity 
            onPress={handleCreate} 
            disabled={loading}
            style={styles.button}
          >
            <Text style={styles.buttonText}>{loading ? "Creating..." : "Create Event"}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 15, alignItems: 'center' }}>
            <Text style={{ color: '#666' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 24, fontWeight: 'bold', color: 'black', marginBottom: 20 },
  card: { backgroundColor: 'white', padding: 20, borderRadius: 12 },
  label: { fontSize: 14, fontWeight: 'bold', color: 'black', marginBottom: 5 },
  input: { 
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, 
    marginBottom: 20, fontSize: 16, color: 'black' 
  },
  button: { backgroundColor: '#004d40', padding: 15, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});
