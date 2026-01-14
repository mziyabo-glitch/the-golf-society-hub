import { useState, useCallback } from "react";
import { View, ScrollView, RefreshControl, ActivityIndicator } from "react-native";
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

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const checkSociety = async () => {
        try {
          // This uses the function from the new lib/firebase.ts
          const id = await waitForActiveSociety();
          if (isActive) {
            setSocietyId(id);
            setLoading(false);
          }
        } catch (e) {
          console.error("Dashboard load failed", e);
          if (isActive) setLoading(false);
        }
      };

      checkSociety();
      return () => { isActive = false; };
    }, [])
  );

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 50 }} />
      </Screen>
    );
  }

  if (!societyId) {
    return (
      <Screen>
        <View style={{ padding: spacing.lg, flex: 1, alignItems: 'center' }}>
          <AppText variant="title">No Society Found</AppText>
          <PrimaryButton 
            title="Create Society" 
            onPress={() => router.push("/create-society")} 
            style={{ marginTop: 20 }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <PrimaryButton 
          title="Create Event" 
          onPress={() => router.push("/create-event")}
          style={{ marginBottom: spacing.lg }} 
        />
        
        {/* Your Dashboard Content Here */}
        <AppText variant="title">Welcome, Captain!</AppText>
        <AppText>Society ID: {societyId}</AppText>
        
        <View style={{ marginTop: 20 }}>
             <SecondaryButton title="Manage Members" onPress={() => router.push("/members")} />
        </View>
      </ScrollView>
    </Screen>
  );
}
