import { useState } from "react";
import { View, TextInput, Alert, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from "react-native";
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
    if (!name.trim()) return alert("Please enter a name");

    try {
      setLoading(true);
      const societyId = getActiveSocietyId();
      if (!societyId) throw new Error("No active society found. Go back to dashboard.");

      // 1. Write to Firestore
      await addDoc(collection(db, "societies", societyId, "members"), {
        name: name.trim(),
        sex: sex,
        handicapIndex: handicap ? parseFloat(handicap) : 0,
        roles: ["member"], // Default role
        joinedAt: serverTimestamp(),
        status: "active"
      });

      // 2. Success
      alert("Member Added Successfully!");
      router.back();

    } catch (e: any) {
      console.error(e);
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={{ padding: 20 }}>
        <Text style={styles.header}>Add New Member</Text>

        <View style={styles.card}>
          {/* Name */}
          <Text style={styles.label}>Name</Text>
          <TextInput 
            value={name}
            onChangeText={setName}
            placeholder="e.g. Rory McIlroy"
            placeholderTextColor="#888"
            style={styles.input}
          />

          {/* Sex Selection */}
          <Text style={styles.label}>Sex</Text>
          <View style={styles.row}>
            <TouchableOpacity 
              onPress={() => setSex("male")}
              style={[styles.sexButton, sex === "male" && styles.selectedMale]}
            >
              <Text style={[styles.btnText, sex === "male" && styles.selectedText]}>Male</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => setSex("female")}
              style={[styles.sexButton, sex === "female" && styles.selectedFemale]}
            >
              <Text style={[styles.btnText, sex === "female" && styles.selectedText]}>Female</Text>
            </TouchableOpacity>
          </View>

          {/* Handicap */}
          <Text style={styles.label}>Handicap Index</Text>
          <TextInput 
            value={handicap}
            onChangeText={setHandicap}
            placeholder="0.0"
            keyboardType="numeric"
            placeholderTextColor="#888"
            style={styles.input}
          />

          {/* Submit Button */}
          <TouchableOpacity 
            onPress={handleAdd} 
            disabled={loading}
            style={styles.submitButton}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.submitText}>Add Member</Text>
            )}
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
  header: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: '#000' }, // BLACK TEXT
  card: { backgroundColor: 'white', padding: 20, borderRadius: 12 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 5, color: '#333' }, // DARK GREY TEXT
  input: { 
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8, 
    padding: 12, marginBottom: 15, fontSize: 16, color: '#000' 
  },
  row: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  sexButton: { 
    flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, 
    borderColor: '#ddd', alignItems: 'center' 
  },
  selectedMale: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  selectedFemale: { backgroundColor: '#E91E63', borderColor: '#E91E63' },
  btnText: { color: '#333', fontWeight: '600' },
  selectedText: { color: 'white' },
  submitButton: { 
    backgroundColor: '#004d40', padding: 15, borderRadius: 8, 
    alignItems: 'center', marginTop: 10 
  },
  submitText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});
