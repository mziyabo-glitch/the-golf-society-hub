import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { collection, onSnapshot, query } from "firebase/firestore";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { db, getActiveSocietyId } from "@/lib/firebase";

export default function MembersScreen() {
  // 1. Initialize state as NULL (Safe for first render)
  const [societyId, setSocietyId] = useState<string | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [isReady, setIsReady] = useState(false);

  // 2. Load the ID safely on client mount
  useEffect(() => {
    const id = getActiveSocietyId();
    setSocietyId(id);
    setIsReady(true);
  }, []);

  // 3. Subscribe to Firestore only when we have an ID
  useEffect(() => {
    if (!societyId) return;

    const q = query(collection(db, "societies", societyId, "members"));

    const unsub = onSnapshot(q, (snap) => {
      setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.error("Members listener failed:", err);
    });

    return unsub;
  }, [societyId]);

  // 4. Show loading state until hydration is complete
  if (!isReady) {
    return (
      <Screen>
        <ActivityIndicator size="large" />
      </Screen>
    );
  }

  // 5. Handle "No Society" case (e.g. if user refreshed page and cache was lost)
  if (!societyId) {
    return (
      <Screen>
        <AppText>No active society found. Please go back home.</AppText>
      </Screen>
    );
  }

  // 6. Render List
  return (
    <Screen>
      <View style={{ padding: 20 }}>
        <AppText variant="title" style={{ marginBottom: 16 }}>
          Members List
        </AppText>

        {members.length === 0 && (
          <AppText>No members found (This should not happen if you are Admin).</AppText>
        )}
        
        {members.map((m) => (
          <View key={m.id} style={{ marginBottom: 12, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
            <AppText style={{ fontWeight: 'bold' }}>{m.name}</AppText>
            <AppText variant="subtle">Roles: {m.roles?.join(", ")}</AppText>
          </View>
        ))}
      </View>
    </Screen>
  );
}
