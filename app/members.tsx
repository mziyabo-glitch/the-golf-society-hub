import { useEffect, useState } from "react";
import { View, ScrollView, Text, ActivityIndicator, StyleSheet } from "react-native";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db, getActiveSocietyId } from "@/lib/firebase";
import { Screen } from "@/components/ui/Screen";

export default function MembersScreen() {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const societyId = getActiveSocietyId();

  useEffect(() => {
    if (!societyId) {
      setLoading(false);
      return;
    }

    const q = query(collection(db, "societies", societyId, "members"), orderBy("name", "asc"));
    
    const unsub = onSnapshot(q, (snap) => {
      setMembers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    return unsub;
  }, [societyId]);

  if (loading) return <Screen><ActivityIndicator size="large" color="black" /></Screen>;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', color: 'black', marginBottom: 20 }}>Members List</Text>
        {members.map((m) => (
          <View key={m.id} style={styles.card}>
            <View>
              <Text style={styles.name}>{m.name}</Text>
              <Text style={styles.subtext}>{m.sex || "Member"} • {m.roles?.join(", ") || "No Roles"}</Text>
            </View>
            <Text style={styles.hcp}>{m.handicapIndex || "0.0"}</Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: 'bold', color: 'black' },
  subtext: { color: '#666', fontSize: 12 },
  hcp: { fontSize: 18, fontWeight: 'bold', color: '#004d40' }
});
