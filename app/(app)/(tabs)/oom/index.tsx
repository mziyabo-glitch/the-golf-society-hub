import { useCallback, useState } from "react";
import { StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useBootstrap } from "@/lib/useBootstrap";
import { getOomLeaderboard, OomRow } from "@/lib/db_supabase/oomRepo";
import { spacing } from "@/lib/ui/theme";

export default function OomLeaderboardScreen() {
  const { societyId, loading: bootstrapLoading } = useBootstrap();
  const [rows, setRows] = useState<OomRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!societyId) return;
    setLoading(true);
    const data = await getOomLeaderboard(societyId);
    setRows(data);
    setLoading(false);
  }, [societyId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (bootstrapLoading || loading) {
    return (
      <Screen>
        <LoadingState label="Loading Order of Merit..." />
      </Screen>
    );
  }

  if (rows.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="No OOM data"
          message="No Order of Merit points have been recorded yet."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppText variant="title" style={{ marginBottom: spacing.lg }}>
        Order of Merit
      </AppText>

      {rows.map((r) => (
        <AppCard key={r.member_id} style={styles.row}>
          <AppText variant="bodyBold">
            {r.position}. {r.name}
          </AppText>
          <AppText variant="caption">
            {r.totalPoints} pts · {r.eventsPlayed} events
          </AppText>
        </AppCard>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: spacing.sm,
  },
});
