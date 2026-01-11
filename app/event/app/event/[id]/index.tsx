import { useEffect, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { SecondaryButton } from "@/components/ui/Button";
import { getPermissions } from "@/lib/rbac";

export default function EventDetailScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [canDelete, setCanDelete] = useState(false);

  // ✅ IMPORTANT: Set this to the route that actually exists in your app.
  // If you’re unsure, "/" will always exist.
  const EVENTS_ROUTE = "/(tabs)/events"; // OR "/"

  useEffect(() => {
    if (!eventId) return;

    const load = async () => {
      try {
        const perms = await getPermissions();
        setCanDelete(!!perms?.isCaptain || !!perms?.isAdmin);

        const ref = doc(db, "events", String(eventId));
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          Alert.alert("Error", "Event not found");
          router.replace(EVENTS_ROUTE);
          return;
        }

        setEvent({ id: snap.id, ...snap.data() });
      } catch (err) {
        console.error("[Event] Load failed", err);
        Alert.alert("Error", "Failed to load event");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [eventId]);

  const confirmDelete = () => {
    Alert.alert(
      "Delete Event",
      "This will permanently delete this event and its tee sheet. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Event",
          style: "destructive",
          onPress: handleDelete,
        },
      ]
    );
  };

  const handleDelete = async () => {
    if (!eventId) return;

    // ✅ Guard (don’t rely only on hiding the button)
    if (!canDelete) {
      Alert.alert("Not allowed", "You don't have permission to delete events.");
      return;
    }

    try {
      console.log("[DeleteEvent] Starting delete:", eventId);

      // Delete tee sheet first (if exists)
      const teeSheetRef = doc(db, "teesheets", String(eventId));
      const teeSheetSnap = await getDoc(teeSheetRef);

      if (teeSheetSnap.exists()) {
        await deleteDoc(teeSheetRef);
        console.log("[DeleteEvent] Tee sheet deleted");
      }

      // Delete event
      const eventRef = doc(db, "events", String(eventId));
      await deleteDoc(eventRef);
      console.log("[DeleteEvent] Event deleted");

      Alert.alert("Deleted", "Event has been deleted");
      router.replace(EVENTS_ROUTE);
    } catch (err) {
      console.error("[DeleteEvent] Failed", err);
      Alert.alert("Error", "Failed to delete event");
    }
  };

  if (loading || !event) {
    return (
      <Screen>
        <AppText>Loading event…</AppText>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <AppCard>
          <AppText variant="title">{event.name}</AppText>
          <AppText>{event.date}</AppText>
          {event.courseName && <AppText>{event.courseName}</AppText>}
        </AppCard>

        {canDelete && (
          <View style={{ marginTop: 24 }}>
            <SecondaryButton label="Delete Event" onPress={confirmDelete} danger />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
