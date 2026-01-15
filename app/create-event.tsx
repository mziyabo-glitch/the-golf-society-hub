import { useState } from "react";
import { View, TextInput, Text, TouchableOpacity, Alert, StyleSheet } from "react-native";
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
    setLoading(true);
    try {
      const societyId = getActiveSocietyId();
      await addDoc(collection(db, "societies", societyId!, "events"), {
        venue: venue.trim(),
        date: date,
        createdAt: serverTimestamp(),
        status: "upcoming"
      });
      router.back();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={{ padding: 20 }}>
        <Text style={styles.header}>Schedule Event</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Venue Name</Text>
          <TextInput value={venue} onChangeText={setVenue} placeholder="e.g. Wrag Barn" placeholderTextColor="#999" style={styles.input} />
          <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
          <TextInput value={date} onChangeText={setDate} placeholder="2026-08-01" placeholderTextColor="#999" style={styles.input} />
          <TouchableOpacity onPress={handleCreate} disabled={loading} style={styles.button}>
            <Text style={{ color: 'white', fontWeight: 'bold' }}>{loading ? "Saving..." : "Create Event"}</Text>
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
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 20, color: 'black' },
  button: { backgroundColor: '#004d40', padding: 15, borderRadius: 8, alignItems: 'center' }
});
