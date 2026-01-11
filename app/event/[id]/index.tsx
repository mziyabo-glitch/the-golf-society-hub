import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { DestructiveButton, SecondaryButton } from "@/components/ui/Button";
import { getPermissions, type Permissions } from "@/lib/rbac";
import { getActiveSocietyId } from "@/lib/firebase";
import { deleteEventCascade, getEventById } from "@/lib/firestore/events";
import type { EventData } from "@/lib/models";
import { formatDateDDMMYYYY } from "@/utils/date";
import { showAlert, confirmAlert } from "@/lib/guards";

export default function EventDetailScreen() {
  const { id: eventId } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<Permissions | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        const perms = await getPermissions();
        setPermissions(perms);

        const societyId = getActiveSocietyId();
        if (!societyId || !eventId) {
          setEvent(null);
          return;
        }

        const loaded = await getEventById(String(eventId), societyId);
        if (!loaded) {
          showAlert("Error", "Event not found", [
            { text: "OK", onPress: () => router.replace("/history" as any) },
          ]);
          return;
        }

        setEvent(loaded);
        console.log("[EventDetails] Loaded event:", String(eventId));
      } catch (err) {
        console.error("[EventDetails] Load failed", err);
        showAlert("Error", "Failed to load event");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [eventId]);

  const confirmDelete = async () => {
    console.log("[DeleteEvent] Confirm delete triggered for event:", eventId);
    
    const confirmed = await confirmAlert(
      "Delete Event",
      "This will permanently delete this event and its results. This cannot be undone.",
      "Delete Event",
      "Cancel"
    );
    
    if (confirmed) {
      await handleDelete();
    }
  };

  const handleDelete = async () => {
    if (!eventId) {
      console.error("[DeleteEvent] No eventId");
      return;
    }

    // Visible only when Captain/Admin-ish, but guard again at write time
    if (!permissions?.isCaptain && !permissions?.canManageEvents) {
      showAlert("Not allowed", "You don't have permission to delete events.");
      return;
    }

    try {
      const societyId = getActiveSocietyId();
      if (!societyId) {
        showAlert("Error", "No active society selected");
        return;
      }

      console.log("[DeleteEvent] Deleting event:", String(eventId), "from society:", societyId);
      const result = await deleteEventCascade(String(eventId), societyId);
      
      if (!result.success) {
        console.error("[DeleteEvent] Delete failed:", result.error);
        showAlert("Error", result.error || "Failed to delete event");
        return;
      }

      console.log("[DeleteEvent] Deleted OK:", String(eventId));
      console.log("[DeleteEvent] Success - navigating to /society");
      
      showAlert("Deleted", "Event has been deleted", [
        { text: "OK", onPress: () => router.replace("/society" as any) },
      ]);
    } catch (err) {
      console.error("[DeleteEvent] Failed with exception:", err);
      showAlert("Error", `Failed to delete event: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  if (loading) {
    return (
      <Screen>
        <View style={{ paddingVertical: 24, alignItems: "center" }}>
          <ActivityIndicator />
          <AppText style={{ marginTop: 12 }}>Loading event…</AppText>
        </View>
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen>
        <AppCard>
          <AppText variant="h2">Event not found</AppText>
          <AppText variant="body" color="secondary" style={{ marginTop: 6 }}>
            This event may have been deleted, or you may not have access.
          </AppText>
          <SecondaryButton onPress={() => router.replace("/history" as any)} style={{ marginTop: 16 }}>
            Back to Events
          </SecondaryButton>
        </AppCard>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <AppCard>
          <AppText variant="title">{event.name}</AppText>
          <AppText>{formatDateDDMMYYYY(event.date)}</AppText>
          {event.courseName ? <AppText>{event.courseName}</AppText> : null}
          {event.format ? <AppText>Format: {event.format}</AppText> : null}
          {typeof (event as any).eventFee === "number" ? (
            <AppText>Fee: £{(event as any).eventFee.toFixed(2)}</AppText>
          ) : null}
        </AppCard>

        <View style={{ marginTop: 16, gap: 12 }}>
          <SecondaryButton
            onPress={() =>
              router.push({ pathname: "/event/[id]/players", params: { id: event.id } } as any)
            }
          >
            Players
          </SecondaryButton>
          <SecondaryButton
            onPress={() =>
              router.push({ pathname: "/event/[id]/results", params: { id: event.id } } as any)
            }
          >
            Results
          </SecondaryButton>
          <SecondaryButton onPress={() => router.push("/tees-teesheet" as any)}>Tee Sheet</SecondaryButton>
        </View>

        {(permissions?.isCaptain || permissions?.canManageEvents) && (
          <View style={{ marginTop: 24 }}>
            <DestructiveButton onPress={confirmDelete}>Delete Event</DestructiveButton>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

