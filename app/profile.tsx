import { useEffect, useState } from "react";
import { View, TextInput, Alert, StyleSheet, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { db, getActiveSocietyId, ensureSignedIn } from "@/lib/firebase";

export default function ProfileScreen() {
  const [name, setName] = useState("");
  const [handicap, setHandicap] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [societyId, setSocietyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      // 1. Get User & Society
      const user = await ensureSignedIn();
      const sId = getActiveSocietyId();
      
      if (!sId) {
        Alert.alert("Error", "No active society found.");
        router.back();
        return;
      }

      setUserId(user.uid);
      setSocietyId(sId);

      // 2. Load YOUR Member Document (The "Captain" entry)
      const memberRef = doc(db, "societies", sId, "members", user.uid);
      const snap = await getDoc(memberRef);

      if (snap.exists()) {
        const data = snap.data();
        setName(data.name || "");
        setHandicap(data.handicapIndex?.toString() || "");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!societyId || !userId) return;

    try {
      setSaving(true);
      const memberRef = doc(db, "societies", societyId, "members", userId);

      // 3. Update YOUR entry
      await updateDoc(memberRef, {
        name: name,
        handicapIndex: handicap ? parseFloat(handicap) : 0,
      });

      Alert.alert("Success", "Profile Updated!");
      router.back();
    } catch (e: any) {
      console.error(e);
      Alert.alert("Error", "Could not save profile.\n" + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Screen><ActivityIndicator size="large" color="#004d40" /></Screen>;

  return (
    <Screen>
      <View style={{ padding: 20 }}>
        <AppText variant="title" style={{ color: 'black', marginBottom: 20 }}>My Profile</AppText>
        
        <View style={styles.card}>
          <AppText style={styles.label}>My Name</AppText>
          <TextInput 
            value={name} 
            onChangeText={setName} 
            placeholder="Enter your name"
            placeholderTextColor="#999"
            style={styles.input} 
          />

          <AppText style={styles.label}>My Handicap</AppText>
          <TextInput 
            value={handicap} 
            onChangeText={setHandicap} 
            keyboardType="numeric"
            placeholder="0.0"
            placeholderTextColor="#999"
            style={styles.input} 
          />

          <PrimaryButton 
            title={saving ? "Saving..." : "Save Profile"} 
            onPress={handleSave} 
            disabled={saving} 
          />
          <View style={{ height: 10 }} />
          <SecondaryButton title="Back" onPress={() => router.back()} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: 'white', padding: 20, borderRadius: 12 },
  label: { color: 'black', fontWeight: 'bold', marginBottom: 5 },
  input: { 
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8, 
    padding: 12, marginBottom: 20, color: 'black', fontSize: 16 
  }
});
