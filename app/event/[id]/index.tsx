import { useState, useCallback } from "react";
import { View, ScrollView, RefreshControl, ActivityIndicator, Alert } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { AppCard } from "@/components/ui/AppCard";
import { getColors, spacing } from "@/lib/ui/theme";
import { waitForActiveSociety } from "@/lib/firebase";

export default function SocietyDashboard() {
  const colors = getColors();
  const [societyId, setSocietyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 1. CRITICAL: Check for ID every time this screen is focused
  // This ensures that when you come back from "Create Society", it picks up the new ID immediately.
  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const checkSociety = async () => {
        try {
          // Uses the safe wait function we created
          const id = await waitForActiveSociety();
          
          if (isActive) {
            setSocietyId(id);
            setLoading(false);
          }
        } catch (e) {
          console.error("Dashboard load failed", e);
        }
      };

      checkSociety();

      return () => { isActive = false; };
    }, [])
  );

  // 2. Loading State
  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <AppText style={{ marginTop: 20 }}>Loading Society...</AppText>
        </View>
      </Screen>
    );
  }

  // 3. "No Society" State (Fallback)
  if (!societyId) {
    return (
      <Screen>
        <View style={{ padding: spacing.lg, flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <AppText variant="title" style={{ marginBottom: spacing.md }}>No Society Found</AppText>
          <AppText style={{ textAlign: 'center', marginBottom: spacing.xl, color: colors.mutedText }}>
            It looks like you aren't part of a society yet.
          </AppText>
          <PrimaryButton 
            title="Create Society" 
            onPress={() => router.push("/create-society")} 
          />
        </View>
      </Screen>
    );
  }

  // 4. MAIN DASHBOARD (Your UI)
  return (
    <Screen>
      <ScrollView 
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => { setLoading(true); waitForActiveSociety().then(id => { setSocietyId(id); setLoading(false); })}} />
        }
      >
        {/* Header Button */}
        <PrimaryButton 
          title="Create Event" 
          onPress={() => router.push("/create-event")}
          style={{ marginBottom: spacing.lg }} 
        />

        {/* Navigation Pills */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xl }}>
          <PillButton title="Members" onPress={() => router.push("/members")} />
          <PillButton title="History" onPress={() => router.push("/history")} />
          <PillButton title="Profile" onPress={() => router.push("/profile")} />
          <PillButton title="Settings" onPress={() => router.push("/society/edit")} />
        </View>

        {/* Next Event Card */}
        <AppText variant="title" style={{ fontSize: 20, marginBottom: spacing.sm }}>Next Event</AppText>
        <AppCard style={{ marginBottom: spacing.xl, padding: spacing.lg, alignItems: 'center' }}>
          <AppText style={{ textAlign: 'center', color: colors.mutedText }}>
            Tap Create Event to schedule your next society day
          </AppText>
        </AppCard>

        {/* ManCo Tools */}
        <AppText variant="title" style={{ fontSize: 20, marginBottom: spacing.sm }}>ManCo Tools</AppText>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
             <AppCard style={{ padding: spacing.md, alignItems: 'center' }}>
                <AppText style={{ fontWeight: 'bold' }}>Finance</AppText>
                <AppText variant="subtle" style={{ fontSize: 12 }}>Treasurer tools</AppText>
             </AppCard>
          </View>
          <View style={{ flex: 1 }}>
             <AppCard style={{ padding: spacing.md, alignItems: 'center' }}>
                <AppText style={{ fontWeight: 'bold' }}>Venue Info</AppText>
                <AppText variant="subtle" style={{ fontSize: 12 }}>Edit venues</AppText>
             </AppCard>
          </View>
        </View>

      </ScrollView>
    </Screen>
  );
}

// Simple helper for the pill buttons
function PillButton({ title, onPress }: { title: string, onPress: () => void }) {
  const colors = getColors();
  return (
    <SecondaryButton 
      title={title} 
      onPress={onPress} 
      style={{ paddingHorizontal: 12, paddingVertical: 8, minWidth: 70 }}
      textStyle={{ fontSize: 14 }}
    />
  );
}
