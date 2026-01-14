import { useState } from "react";
import { View, TextInput, Alert, ActivityIndicator, TouchableOpacity, StyleSheet } from "react-native";
import { router } from "expo-router";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { db, getActiveSocietyId } from "@/lib/firebase";

export default function AddMemberScreen() {
  const [name, setName] = useState("");
  const [handicap, setHandicap] = useState("");
  const [sex, setSex] = useState<"male" | "female">("male"); // Restored Gender
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) return Alert.alert("Error", "Name required");
    
    try {
      setLoading(true);
      const societyId = getActiveSocietyId();
      if (!societyId) throw new Error("No active society");

      // SAVE TO FIREBASE
      await addDoc(collection(db, "societies", societyId, "members"), {
        name: name.trim(),
        sex: sex,
        handicapIndex: handicap ? parseFloat(handicap) : 0,
        roles: ["member"],
        joinedAt: serverTimestamp(),
        status: "active"
      });

      Alert.alert("Success", "Member Added!");
      router.back();
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", "Could not add member: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={{ padding: 20 }}>
        <AppText variant="title" style={{ color: '#000', marginBottom: 10 }}>Add Member</AppText>
        
        <AppCard style={{ padding: 20, backgroundColor: 'white' }}>
          
          {/* NAME FIELD */}
          <AppText style={styles.label}>Player Name</AppText>
          <TextInput 
            value={name} 
            onChangeText={setName} 
            placeholder="e.g. Tiger Woods"
            placeholderTextColor="#999"
            style={styles.input} 
          />

          {/* SEX / GENDER FIELD (Restored) */}
          <AppText style={styles.label}>Sex</AppText>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
            <TouchableOpacity 
              onPress={() => setSex('male')}
              style={[styles.sexButton, sex === 'male' && styles.sexButtonActive]}
            >
              <AppText style={{ color: sex === 'male' ? 'white' : 'black' }}>Male</AppText>
            </TouchableOpacity>

            <TouchableOpacity 
              onPress={() => setSex('female')}
              style={[styles.sexButton, sex === 'female' && styles.sexButtonActive]}
            >
              <AppText style={{ color: sex === 'female' ? 'white' : 'black' }}>Female</AppText>
            </TouchableOpacity>
          </View>

          {/* HANDICAP FIELD */}
          <AppText style={styles.label}>Handicap Index</AppText>
          <TextInput 
            value={handicap} 
            onChangeText={setHandicap} 
            keyboardType="numeric"
            placeholder="e.g. 5.4"
            placeholderTextColor="#999"
            style={styles.input} 
          />

          {/* BUTTONS */}
          <View style={{ marginTop: 10 }}>
            <PrimaryButton 
              title={loading ? "Adding..." : "Add Member"} 
              onPress={handleAdd} 
              disabled={loading} 
            />
            <View style={{ height: 10 }} />
            <SecondaryButton title="Cancel" onPress={() => router.back()} />
          </View>

        </AppCard>
      </View>
    </Screen>
  );
}

// FORCE VISIBLE STYLES
const styles = StyleSheet.create({
  label: {
    color: '#000', // Force black text
    fontWeight: '600',
    marginBottom: 6,
    fontSize: 14
  },
  input: {
    borderWidth: 1, 
    borderColor: '#ccc', 
    padding: 12, 
    borderRadius: 8, 
    color: '#000', // Force black text input
    backgroundColor: '#fff',
    marginBottom: 16,
    fontSize: 16
  },
  sexButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
    backgroundColor: '#f0f0f0'
  },
  sexButtonActive: {
    backgroundColor: '#004d40', // Your Green Theme Color
    borderColor: '#004d40'
  }
});
