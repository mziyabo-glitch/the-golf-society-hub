import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { STORAGE_KEYS } from "@/lib/storage";
import { loadThemeFromStorage, spacing } from "@/lib/ui/theme";
import { formatDateDDMMYYYY } from "@/utils/date";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

const EVENTS_KEY = STORAGE_KEYS.EVENTS;

type EventData = {
  id: string;
  name: string;
  date: string;
  courseName: string;
  format: "Stableford" | "Strokeplay" | "Both";
};

export default function HistoryScreen() {
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadEvents();
      loadThemeFromStorage();
    }, [])
  );

  const loadEvents = async () => {
    try {
      const eventsData = await AsyncStorage.getItem(EVENTS_KEY);
      if (eventsData) {
        const allEvents: EventData[] = JSON.parse(eventsData);
        // Sort by date (most recent first)
        const sorted = allEvents.sort((a, b) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          return dateB - dateA;
        });
        setEvents(sorted);
      }
    } catch (error) {
      console.error("Error loading events:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#0B6E4F" />
      </View>
    );
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



