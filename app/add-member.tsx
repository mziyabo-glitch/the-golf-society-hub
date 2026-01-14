import { useState } from "react";
import { View, TextInput, Alert, ActivityIndicator } from "react-native";
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
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!name.trim()) return Alert.alert("Error", "Name required");
    
    try {
      setLoading(true);
      const societyId = getActiveSocietyId();
      if (!societyId) throw new Error("No active society");

      // Uses Random ID (addDoc). 
      // This SUCCEEDS because Rules now allow 'isSocietyAdmin' to write ANY member doc.
      await addDoc(collection(db, "societies", societyId, "members"), {
        name: name.trim(),
        handicapIndex: handicap ? parseFloat(handicap) : 0,
        roles: ["member"],
        joinedAt: serverTimestamp(),
        status: "active"
      });

      router.back();
      // Use standard alert for web compatibility if needed, or simple Alert
      Alert.alert("Success", "Member Added");
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
        <AppText variant="title">Add Member</AppText>
        <AppCard style={{ marginTop: 20, padding: 20 }}>
          <AppText>Name</AppText>
          <TextInput 
            value={name} onChangeText={setName} 
            style={{ borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 8, color: 'white', marginBottom: 15 }} 
          />
          <AppText>Handicap</AppText>
          <TextInput 
            value={handicap} onChangeText={setHandicap} keyboardType="numeric"
            style={{ borderWidth: 1, borderColor: '#ccc', padding: 10, borderRadius: 8, color: 'white', marginBottom: 20 }} 
          />
          <PrimaryButton title={loading ? "Adding..." : "Add Member"} onPress={handleAdd} disabled={loading} />
          <SecondaryButton title="Cancel" onPress={() => router.back()} style={{ marginTop: 10 }} />
        </AppCard>
      </View>
    </Screen>
  );
}
