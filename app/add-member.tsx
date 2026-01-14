// app/members.tsx
import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { collection, onSnapshot, query } from "firebase/firestore";
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { db, waitForActiveSociety } from "@/lib/firebase"; // Import new helper

export default function MembersScreen() {
  const [societyId, setSocietyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => {
    let unsub: () => void;

    const init = async () => {
      try {
        // This WAITS until the ID is truly ready (no more race condition)
        const id = await waitForActiveSociety();
        setSocietyId(id);

        if (id) {
          const q = query(collection(db, "societies", id, "members"));
          unsub = onSnapshot(q, (snap) => {
            setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          });
        }
      } catch (e) {
        console.error("Failed to load society:", e);
      } finally {
        setLoading(false);
      }
    };

    init();
    return () => unsub && unsub();
  }, []);

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator size="large" />
      </Screen>
    );
  }

  if (!societyId) {
    return (
      <Screen>
        <AppText>No active society found.</AppText>
      </Screen>
    );
  }

  return (
    <Screen>
      {/* Your list code here */}
      {members.map(m => <AppText key={m.id}>{m.name}</AppText>)}
    </Screen>
  );
}
