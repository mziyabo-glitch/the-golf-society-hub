import { useEffect, useMemo, useState } from "react";
import { View, TextInput, Alert, StyleSheet, Platform } from "react-native";
import { router } from "expo-router";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { getColors, spacing } from "@/lib/ui/theme";

import { db, ensureSignedIn, getActiveSocietyId, initActiveSocietyId } from "@/lib/firebase";

export default function AddMemberScreen() {
  const colors = getColors();

  const [booting, setBooting] = useState(true);
  const [activeSocietyId, setActiveSocietyId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [handicapIndex, setHandicapIndex] = useState("");
  const [sex, setSex] = useState<"male" | "female">("male");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        await ensureSignedIn();
        const sid = (await initActiveSocietyId()) ?? getActiveSocietyId();
        setActiveSocietyId(sid ?? null);
      } catch (e) {
        console.error("[add-member] init error", e);
      } finally {
        setBooting(false);
      }
    };
    void run();
  }, []);

  const canSubmit = useMemo(() => {
    return !!activeSocietyId && name.trim().length >= 2 && !saving;
  }, [activeSocietyId, name, saving]);

  const handleAdd = async () => {
    if (!activeSocietyId) {
      Alert.alert("No society selected", "Please create/select a society first.");
      router.replace("/create-society");
      return;
    }

    if (name.trim().length < 2) {
      Alert.alert("Missing info", "Member name must be at least 2 characters.");
      return;
    }

    try {
      setSaving(true);
      const user = await ensureSignedIn();

      const parsedHcp =
        handicapIndex.trim() === "" ? null : Number(handicapIndex.trim());

      if (parsedHcp !== null && (Number.isNaN(parsedHcp) || parsedHcp < -10 || parsedHcp > 54)) {
        Alert.alert("Invalid handicap", "Enter a number between -10 and 54, or leave blank.");
        return;
      }

      await addDoc(collection(db, "societies", activeSocietyId, "members"), {
        userId: null, // link later when they actually sign in
        name: name.trim(),
        sex,
        handicapIndex: parsedHcp,
        roles: ["member"],
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: user.uid,
      });

      Alert.alert("Added", "Member added successfully.");
      router.replace("/members");
    } catch (e: any) {
      console.error("[add-member] save error", e);
      Alert.alert("Error", e?.message ?? "Could not add member.");
    } finally {
      setSaving(false);
    }
  };

  if (booting) {
    return (
      <Screen>
        <View style={{ padding: spacing.lg }}>
          <AppText>Loading…</AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ padding: spacing.lg }}>
        <AppText variant="title" style={{ marginBottom: spacing.xs }}>
          Add Member
        </AppText>
        <AppText variant="subtle" style={{ marginBottom: spacing.lg }}>
          Add a new member to your society.
        </AppText>

        <AppCard style={{ padding: spacing.lg }}>
          <AppText style={{ marginBottom: spacing.xs }}>Member Name *</AppText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Enter member name (min 2 characters)"
            placeholderTextColor={colors.mutedText}
            style={[
              styles.input,
              { borderColor: colors.border, backgroundColor: colors.card, color: colors.text },
            ]}
          />

          <AppText style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
            Handicap Index
          </AppText>
          <TextInput
            value={handicapIndex}
            onChangeText={setHandicapIndex}
            placeholder="Enter handicap (optional, e.g., 12.5)"
            placeholderTextColor={colors.mutedText}
            keyboardType={Platform.OS === "web" ? "text" : "decimal-pad"}
            style={[
              styles.input,
              { borderColor: colors.border, backgroundColor: colors.card, color: colors.text },
            ]}
          />

          <AppText style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
            Sex *
          </AppText>

          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <PrimaryButton
              title="Male"
              onPress={() => setSex("male")}
              disabled={sex === "male"}
            />
            <PrimaryButton
              title="Female"
              onPress={() => setSex("female")}
              disabled={sex === "female"}
            />
          </View>

          <View style={{ marginTop: spacing.lg }}>
            <PrimaryButton
              title={saving ? "Adding..." : "Add Member"}
              onPress={handleAdd}
              disabled={!canSubmit}
            />
            <View style={{ height: spacing.sm }} />
            <SecondaryButton title="Back" onPress={() => router.back()} />
          </View>
        </AppCard>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 12 : 10,
    fontSize: 16,
  },
});
