/**
 * History Screen - Shows all events sorted by date
 * 
 * FIRESTORE-ONLY: Events are loaded from societies/{societyId}/events
 */

import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { spacing } from "@/lib/ui/theme";
import { formatDateDDMMYYYY } from "@/utils/date";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { listEvents } from "@/lib/firestore/events";
import { getActiveSocietyId } from "@/lib/firebase";
import { NoSocietyGuard } from "@/components/NoSocietyGuard";
import type { EventData } from "@/lib/models";

export default function HistoryScreen() {
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [societyId, setSocietyId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [])
  );

  const loadEvents = async () => {
    try {
      const activeSocietyId = getActiveSocietyId();
      setSocietyId(activeSocietyId);
      
      if (!activeSocietyId) {
        setLoading(false);
        return;
      }

      // Load events from Firestore
      const allEvents = await listEvents(activeSocietyId);
      
      // Sort by date (most recent first)
      const sorted = [...allEvents].sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
      });
      
      setEvents(sorted);
      
      if (__DEV__) {
        console.log("[History] Loaded", sorted.length, "events from Firestore");
      }
    } catch (error) {
      console.error("[History] Error loading events:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#0B6E4F" />
        <AppText style={{ marginTop: 12 }}>Loading events...</AppText>
      </View>
    );
  }

  if (!societyId) {
    return <NoSocietyGuard message="Please select a society to view event history." />;
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <AppText variant="title" style={styles.title}>History</AppText>

        {events.length === 0 ? (
          <View style={styles.emptyState}>
            <AppText variant="h2" style={styles.emptyText}>No events yet</AppText>
            <AppText variant="caption" color="secondary" style={styles.emptySubtext}>Create your first event to get started</AppText>
          </View>
        ) : (
          events.map((event) => (
            <AppCard key={event.id} style={styles.eventCard}>
              <Pressable
                onPress={() => router.push(`/event/${event.id}` as any)}
                style={styles.eventPressable}
              >
                <AppText variant="h2" numberOfLines={1} style={styles.eventName}>{event.name}</AppText>
                <AppText variant="caption" color="secondary" style={styles.eventDate}>{formatDateDDMMYYYY(event.date)}</AppText>
                {event.courseName && (
                  <AppText variant="caption" color="secondary" numberOfLines={1} style={styles.eventCourse}>{event.courseName}</AppText>
                )}
              </Pressable>
            </AppCard>
          ))
        )}

        <AppButton
          label={events.length === 0 ? "Create First Event" : "Create Event"}
          onPress={() => router.push("/create-event" as any)}
          variant="primary"
          size="lg"
          fullWidth
          style={styles.addButton}
        />

        <AppButton
          label="Back"
          onPress={() => router.back()}
          variant="ghost"
          size="md"
          style={styles.backButton}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flex: 1,
    padding: spacing.xl,
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    marginBottom: spacing.xl,
  },
  emptyState: {
    alignItems: "center",
    marginTop: spacing["3xl"],
    marginBottom: spacing.xl,
  },
  emptyText: {
    marginBottom: spacing.sm,
  },
  emptySubtext: {
    marginBottom: spacing.base,
  },
  eventCard: {
    marginBottom: spacing.base,
  },
  eventPressable: {
    width: "100%",
  },
  eventName: {
    marginBottom: spacing.xs,
  },
  eventDate: {
    marginBottom: spacing.xs,
  },
  eventCourse: {
    marginTop: spacing.xs,
  },
  addButton: {
    marginTop: spacing.sm,
    marginBottom: spacing.base,
  },
  backButton: {
    marginTop: spacing.sm,
  },
});
