import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const EVENTS_KEY = "GSOCIETY_EVENTS";

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
        <Text style={styles.title}>History</Text>

        {events.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No events yet</Text>
            <Text style={styles.emptySubtext}>Create your first event to get started</Text>
          </View>
        ) : (
          events.map((event) => (
            <Pressable
              key={event.id}
              onPress={() => router.push(`/event/${event.id}` as any)}
              style={styles.eventCard}
            >
              <Text style={styles.eventName}>{event.name}</Text>
              <Text style={styles.eventDate}>{event.date || "No date"}</Text>
              {event.courseName && (
                <Text style={styles.eventCourse}>{event.courseName}</Text>
              )}
            </Pressable>
          ))
        )}

        <Pressable
          onPress={() => router.push("/create-event" as any)}
          style={styles.addButton}
        >
          <Text style={styles.buttonText}>
            {events.length === 0 ? "Create First Event" : "Create Event"}
          </Text>
        </Pressable>

        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Back</Text>
        </Pressable>
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
    padding: 24,
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    marginBottom: 24,
  },
  emptyState: {
    alignItems: "center",
    marginTop: 40,
    marginBottom: 24,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.6,
    color: "#111827",
  },
  eventCard: {
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  eventName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  eventDate: {
    fontSize: 14,
    opacity: 0.7,
    color: "#111827",
    marginBottom: 2,
  },
  eventCourse: {
    fontSize: 14,
    opacity: 0.7,
    color: "#111827",
  },
  addButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 12,
  },
  buttonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
  },
  backButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
  },
});



