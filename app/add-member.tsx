import { useState } from "react";
import { View, TextInput, Alert } from "react-native";
import { router } from "expo-router";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { db, getActiveSocietyId } from "@/lib/firebase";

export default function AddMemberScreen() {
  const [name, setName] = useState("");
  const [handicap, setHandicap] = useState("");
  const [sex, setSex] = useState<"male" | "female">("male");

  const societyId = getActiveSocietyId();

  if (!societyId) {
    Alert.alert("No active society", "Create or select a society first.");
    router.back();
    return null;
  }

  const handleAdd = async () => {
    if (name.trim().length < 2) {
      Alert.alert("Name too short");
      return;
    }

    await addDoc(
      collection(db, "societies", societyId, "members"),
      {
        name: name.trim(),
        sex,
        handicapIndex: handicap ? Number(handicap) : null,
        roles: ["member"],
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
    );

    router.back();
  };

  return (
    <Screen>
      <View>
        <AppText>Member Name *</AppText>
        <TextInput value={name} onChangeText={setName} />

        <AppText>Handicap Index</AppText>
        <TextInput value={handicap} onChangeText={setHandicap} />

        <PrimaryButton title="Add Member" onPress={handleAdd} />
        <SecondaryButton title="Back" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
