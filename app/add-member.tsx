import { useState } from "react";
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Screen } from "@/components/ui/Screen";
import { db, getActiveSocietyId } from "@/lib/firebase";

export default function AddMemberScreen() {
  const [name, setName] = useState("");
  const [handicap, setHandicap] = useState("");
  const [sex, setSex] = useState<"male" | "female">("male");
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    // 1. Validation
    if (!name.trim()) {
      Alert.alert("Missing Info", "Please enter a player name.");
      return;
    }

    try {
      setLoading(true);

      // 2. Get the Current Society ID
      const societyId = getActiveSocietyId();
      if (!societyId) {
        Alert.alert("Error", "No Active Society found. Please go back to the dashboard.");
        return;
      }

      // 3. Write to the MEMBERS Subcollection
      // Path: societies/{societyId}/members/{randomID}
      await addDoc(collection(db, "societies", societyId, "members"), {
        name: name.trim(),
        sex: sex,
        handicapIndex: handicap ? parseFloat(handicap) : 0,
        roles: ["member"], // Basic role for players you add manually
        joinedAt: serverTimestamp(),
        status: "active",
        isManualEntry: true // Flag to know this isn't a real App User yet
      });

      // 4. Success
      Alert.alert("Success", "Player added to roster!");
      router.back();

    } catch (e: any) {
      console.error("Add Member Failed:", e);
      Alert.alert("Error", "Could not save member.\n" + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={styles.container}>
        <Text style={styles.header}>Add New Player</Text>
        
        <View style={styles.card}>
          
          {/* NAME */}
          <Text style={styles.label}>Player Name</Text>
          <TextInput 
            value={name} 
            onChangeText={setName} 
            placeholder="e.g. Tiger Woods"
            placeholderTextColor="#999"
            style={styles.input} 
          />

          {/* SEX / GENDER */}
          <Text style={styles.label}>Sex</Text>
          <View style={styles.sexContainer}>
            <TouchableOpacity 
              onPress={() => setSex("male")}
              style={[styles.sexButton, sex === "male" && styles.sexMaleActive]}
            >
              <Text style={[styles.sexText, sex === "male" && styles.sexTextActive]}>Male</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => setSex("female")}
              style={[styles.sexButton, sex === "female" && styles.sexFemaleActive]}
            >
              <Text style={[styles.sexText, sex === "female" && styles.sexTextActive]}>Female</Text>
            </TouchableOpacity>
          </View>

          {/* HANDICAP */}
          <Text style={styles.label}>Handicap Index</Text>
          <TextInput 
            value={handicap} 
            onChangeText={setHandicap} 
            keyboardType="numeric"
            placeholder="e.g. 5.4"
            placeholderTextColor="#999"
            style={styles.input} 
          />

          {/* ACTION BUTTONS */}
          <View style={styles.buttonContainer}>
             <TouchableOpacity 
                onPress={handleAdd} 
                disabled={loading}
                style={styles.primaryButton}
             >
                {loading ? (
                   <ActivityIndicator color="white" />
                ) : (
                   <Text style={styles.primaryButtonText}>Add to Roster</Text>
                )}
             </TouchableOpacity>

             <TouchableOpacity onPress={() => router.back()} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
             </TouchableOpacity>
          </View>

        </View>
      </View>
    </Screen>
  );
}

// STYLES - Designed for Visibility
const styles = StyleSheet.create({
  container: { padding: 20 },
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#000' },
  card: { backgroundColor: 'white', padding: 20, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
  
  label: { fontSize: 14, fontWeight: '700', marginBottom: 8, color: '#333' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 14, fontSize: 16, marginBottom: 20, color: '#000', backgroundColor: '#FAFAFA' },
  
  sexContainer: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  sexButton: { flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#E0E0E0', alignItems: 'center', backgroundColor: '#FFF' },
  sexMaleActive: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  sexFemaleActive: { backgroundColor: '#E91E63', borderColor: '#E91E63' },
  sexText: { color: '#666', fontWeight: '600' },
  sexTextActive: { color: 'white' },

  buttonContainer: { marginTop: 10 },
  primaryButton: { backgroundColor: '#004d40', padding: 16, borderRadius: 10, alignItems: 'center', marginBottom: 12 },
  primaryButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  cancelButton: { alignItems: 'center', padding: 10 },
  cancelText: { color: '#666', fontSize: 16 }
});
