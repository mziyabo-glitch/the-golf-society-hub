import { useEffect, useState } from "react";
import { View } from "react-native";
import { collection, onSnapshot, query } from "firebase/firestore";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { db, getActiveSocietyId } from "@/lib/firebase";

export default function MembersScreen() {
  const [members, setMembers] = useState<any[]>([]);
  const societyId = getActiveSocietyId();

  useEffect(() => {
    if (!societyId) return;

    const q = query(
      collection(db, "societies", societyId, "members")
    );

    const unsub = onSnapshot(q, (snap) => {
      setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return unsub;
  }, [societyId]);

  if (!societyId) {
    return (
      <Screen>
        <AppText>No active society selected.</AppText>
      </Screen>
    );
  }

  return (
    <Screen>
      {members.length === 0 && <AppText>No members yet.</AppText>}
      {members.map((m) => (
        <View key={m.id}>
          <AppText>{m.name}</AppText>
        </View>
      ))}
    </Screen>
  );
}
