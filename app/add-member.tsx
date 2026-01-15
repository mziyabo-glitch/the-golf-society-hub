import { useEffect, useState } from "react";
import { View, ScrollView, Text, ActivityIndicator, StyleSheet } from "react-native";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { router } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { db, getActiveSocietyId, ensureSignedIn } from "@/lib/firebase";

export default function MembersScreen() {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [societyId, setSocietyId] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      // 1. Ensure we are logged in
      await ensureSignedIn();
      const id = getActiveSocietyId();
      setSocietyId(id);

      if (!id) {
        setLoading(false);
        return;
      }

      // 2. Listen DIRECTLY to the database (Bypasses the broken 'listMembers' file)
      const q = query(collection(db, "societies", id, "members"), orderBy("name", "asc"));
      
      const unsub = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setMembers(list);
        setLoading(false);
      }, (err) => {
        console.error("Members load error:", err);
        setLoading(false);
      });

      return () => unsub();
    }
    
    init();
  }, []);

  if (loading) return <Screen><ActivityIndicator size="large" color="black" /></Screen>;

  if (!societyId) {
    return (
      <Screen>
        <View style={{padding: 20}}>
           <Text style={styles.text}>No Active Society. Please go back to Dashboard.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* Header with Add Button */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <Text style={styles.header}>Members List</Text>
          <Text 
            onPress={() => router.push("/add-member")}
            style={{ color: '#004d40', fontWeight: 'bold', padding: 10 }}
          >
            + Add Member
          </Text>
        </View>

        {members.length === 0 && (
          <Text style={styles.text}>No members found. Click "Add Member" to start.</Text>
        )}

        {members.map((m) => (
          <View key={m.id} style={styles.card}>
            <View>
              <Text style={styles.name}>{m.name}</Text>
              <Text style={styles.subtext}>
                 {m.sex === 'female' ? 'Woman' : 'Man'} • {m.roles?.join(", ") || "Member"}
              </Text>
            </View>
            <Text style={styles.hcp}>{m.handicapIndex ?? "0.0"}</Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 24, fontWeight: 'bold', color: 'black' },
  text: { color: 'black', fontSize: 16 },
  card: { 
    backgroundColor: 'white', 
    padding: 15, 
    borderRadius: 10, 
    marginBottom: 10, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 5
  },
  name: { fontSize: 16, fontWeight: 'bold', color: 'black' },
  subtext: { color: '#666', fontSize: 14, marginTop: 2 },
  hcp: { fontSize: 18, fontWeight: 'bold', color: '#004d40' }
});
