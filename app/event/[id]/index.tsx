import { useEffect, useMemo, useState } from "react";
import { Alert, Platform, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { SecondaryButton } from "@/components/ui/Button";

import { getPermissions } from "@/lib/rbac";
import { formatDateDDMMYYYY } from "@/utils/date";

// Try to import your existing firestore helpers.
// If your repo uses different names, adjust these imports to match.
import {
  getEventById,
  deleteEventCascade,
} from "@/lib/firestore/events";

type AnyEvent = {
  id: string;
  name?: string;
  date?: string;
  courseName?: string;
  courseId?: string;
  [k: string]: any;
};

const BACK_ROUTE = "/events"; // CHANGE TO "/society" if that's your events list screen

export default function EventDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const eventId = useMemo(() => String(params.id || ""), [params.id]);

  const [event, setEvent] = useState<AnyEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [canDelete, setCanDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!eventId) return;

    const load = async () => {
      try {
        setLoading(true);

        // Permissions
        const perms = await getPermissions();
        // Captain can delete events
        setCanDelete(!!perms?.isCaptain || !!perms?.canDeleteEvent);

        // Event
        const evt = await getEventById(eventId);
        if (!evt) {
          Alert.alert("Not found", "Event not found.");
          router.replace(BACK_ROUTE);
          return;
        }
        setEvent(evt as AnyEvent);
      } catch (err) {
        console.error("[EventDetail] Load failed", err);
        Alert.alert("Error", "Failed to load event.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [eventId]);

  const confirmDelete = () => {
    const msg =
      "This will permanently delete this event and any related data (tee sheet, players, results).\n\nThis cannot be undone.";

    if (!canDelete) {
      Alert.alert("Not allowed", "You don’t have permission to delete this event.");
      return;
    }

    if (deleting) return;

    // Web confirm (more reliable than RN Alert on web)
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      const ok = window.confirm(msg);
      if (ok) void handleDelete();
      return;
    }

    Alert.alert("Delete Event", msg, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void handleDelete() },
    ]);
  };

  const handleDelete = async () => {
    if (!eventId) return;
    if (!canDelete) {
      Alert.alert("Not allowed", "You don’t have permission to delete this event.");
      return;
    }

    try {
      setDeleting(true);
      console.log("[DeleteEvent] Starting delete:", eventId);

      // Primary delete path
      if (typeof deleteEventCascade === "function") {
        await deleteEventCascade(eventId);
      } else {
        // Very defensive fallback: if helper is missing, fail loudly
        throw new Error("deleteEventCascade is not available in lib/firestore/events.ts");
      }

      console.log("[DeleteEvent] Deleted OK:", eventId);

      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        window.alert("Event deleted.");
      } else {
        Alert.alert("Deleted", "Event deleted.");
      }

      router.replace(BACK_ROUTE);
    } catch (err: any) {
      console.error("[DeleteEvent] Failed", err);
      const message =
        err?.message?.includes("permission") ? "Permission denied." : "Failed to delete event.";
      Alert.alert("Error", message);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <AppText>Loading…</AppText>
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen>
        <AppText>Event not found.</AppText>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <AppCard>
          <AppText variant="title">{event.name || "Event"}</AppText>
          {!!event.date && <AppText>{formatDateDDMMYYYY(event.date)}</AppText>}
          {!!event.courseName && <AppText>{event.courseName}</AppText>}
        </AppCard>

        {/* Add your other actions here (players/results/teesheet navigation etc.) */}

        {canDelete && (
          <View style={{ marginTop: 20 }}>
            <SecondaryButton
              onPress={confirmDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete Event"}
            </SecondaryButton>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
