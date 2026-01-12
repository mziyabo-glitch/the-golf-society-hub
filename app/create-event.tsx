/**
 * Create Event Screen
 * 
 * FIRESTORE-ONLY: Events are stored in societies/{societyId}/events/{eventId}
 * No AsyncStorage usage for event data.
 * 
 * - Uses Firestore addDoc for auto-generated doc ID
 * - Stores date as proper Firestore Timestamp
 * - Uses serverTimestamp() for createdAt
 */

import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View, ActivityIndicator } from "react-native";
import { getSession } from "@/lib/session";
import { canCreateEvents, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { getCurrentUserRoles } from "@/lib/roles";
import { DatePicker } from "@/components/DatePicker";
import { getActiveSocietyId, isFirebaseConfigured } from "@/lib/firebase";
import { createEvent } from "@/lib/firestore/events";
import { NoSocietyGuard } from "@/components/NoSocietyGuard";

export default function CreateEventScreen() {
  const router = useRouter();
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState(""); // ISO format YYYY-MM-DD from DatePicker
  const [courseName, setCourseName] = useState("");
  const [format, setFormat] = useState<"Stableford" | "Strokeplay" | "Both">("Stableford");
  const [isOOM, setIsOOM] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const [societyId, setSocietyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadSession();
    }, [])
  );

  const loadSession = async () => {
    setLoading(true);
    
    // Check Firebase config first
    if (!isFirebaseConfigured()) {
      console.warn("[CreateEvent] Firebase not configured");
      setLoading(false);
      return;
    }

    // Check active society
    const activeSocietyId = getActiveSocietyId();
    setSocietyId(activeSocietyId);

    if (!activeSocietyId) {
      setLoading(false);
      return;
    }

    const session = await getSession();
    
    const sessionRole = normalizeSessionRole(session.role);
    const roles = normalizeMemberRoles(await getCurrentUserRoles());
    const canCreateEventsRole = canCreateEvents(sessionRole, roles);
    setCanCreate(canCreateEventsRole);
    
    if (!canCreateEventsRole) {
      Alert.alert("Access Denied", "Only Captain or Secretary can create events", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
    
    setLoading(false);
  };

  /**
   * Parse the ISO date string from DatePicker into a JS Date object
   * DatePicker returns "YYYY-MM-DD" format
   */
  const parseSelectedDate = (): Date | null => {
    if (!eventDate) return null;
    
    // Parse YYYY-MM-DD format
    const parts = eventDate.split("-");
    if (parts.length !== 3) return null;
    
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
    const day = parseInt(parts[2], 10);
    
    const date = new Date(year, month, day, 12, 0, 0); // Noon to avoid timezone issues
    
    if (isNaN(date.getTime())) return null;
    return date;
  };

  const handleSubmit = async () => {
    if (!eventName.trim()) {
      Alert.alert("Validation Error", "Event name is required");
      return;
    }

    if (!societyId) {
      Alert.alert("Error", "No society selected. Please go back and select a society.");
      return;
    }

    // Parse the date
    const parsedDate = parseSelectedDate();
    if (!parsedDate) {
      Alert.alert("Validation Error", "Please select a valid event date");
      return;
    }

    setSaving(true);

    try {
      const result = await createEvent({
        name: eventName.trim(),
        date: parsedDate,
        courseName: courseName.trim(),
        format,
        isOOM,
        handicapAllowancePct: 100, // Default
      }, societyId);

      if (result.success) {
        console.log("[CreateEvent] Event created:", result.eventId);
        Alert.alert("Success", "Event created successfully!", [
          { text: "OK", onPress: () => router.back() }
        ]);
      } else {
        console.error("[CreateEvent] Failed:", result.error);
        Alert.alert("Error", result.error || "Failed to create event. Please try again.");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("[CreateEvent] Error:", error);
      Alert.alert("Error", `Failed to create event: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color="#0B6E4F" />
        <Text style={{ marginTop: 12, color: "#6b7280" }}>Loading...</Text>
      </View>
    );
  }

  // No society selected
  if (!societyId) {
    return <NoSocietyGuard message="You need to select a society before creating events." />;
  }

  // No permission
  if (!canCreate) {
    return null; // Will redirect via Alert
  }

  const isFormValid = eventName.trim().length > 0 && eventDate.length > 0;

  return (
      <ScrollView style={{ flex: 1, backgroundColor: "#fff" }}>
        <View style={{ flex: 1, padding: 24 }}>
          <Text style={{ fontSize: 34, fontWeight: "800", marginBottom: 6 }}>
            Create Event
          </Text>
          <Text style={{ fontSize: 16, opacity: 0.75, marginBottom: 28 }}>
            Add a new golf event to your society.
          </Text>

          {/* Event Name */}
          <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8, marginTop: 8 }}>
            Event Name <Text style={{ color: "#ef4444" }}>*</Text>
          </Text>
          <TextInput
            value={eventName}
            onChangeText={setEventName}
            placeholder="Enter event name"
            style={{
              backgroundColor: "#f3f4f6",
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderRadius: 14,
              fontSize: 16,
              marginBottom: 20,
            }}
          />

          {/* Event Date */}
          <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
            Event Date <Text style={{ color: "#ef4444" }}>*</Text>
          </Text>
          <DatePicker
            value={eventDate}
            onChange={setEventDate}
            placeholder="Select date"
            style={{
              marginBottom: 20,
            }}
          />

          {/* Course Name */}
          <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
            Course Name
          </Text>
          <TextInput
            value={courseName}
            onChangeText={setCourseName}
            placeholder="Enter course name (optional)"
            style={{
              backgroundColor: "#f3f4f6",
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderRadius: 14,
              fontSize: 16,
              marginBottom: 20,
            }}
          />

          {/* Format */}
          <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
            Format
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
            {(["Stableford", "Strokeplay", "Both"] as const).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => setFormat(mode)}
                style={{
                  flex: 1,
                  backgroundColor: format === mode ? "#0B6E4F" : "#f3f4f6",
                  paddingVertical: 12,
                  borderRadius: 14,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: format === mode ? "white" : "#111827",
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  {mode}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* OOM Event Toggle */}
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 12 }}>
              Order of Merit Event?
            </Text>
            <Pressable
              onPress={() => setIsOOM(!isOOM)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#f3f4f6",
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderRadius: 14,
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: isOOM ? "#0B6E4F" : "#d1d5db",
                  marginRight: 12,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                {isOOM && (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: "#fff",
                    }}
                  />
                )}
              </View>
              <Text style={{ fontSize: 16, color: "#111827" }}>
                {isOOM ? "Yes, this is an Order of Merit event" : "No, this is not an Order of Merit event"}
              </Text>
            </Pressable>
          </View>

          {/* Create Event Button */}
          <Pressable
            onPress={handleSubmit}
            disabled={!isFormValid || saving}
            style={{
              backgroundColor: isFormValid && !saving ? "#0B6E4F" : "#9ca3af",
              paddingVertical: 14,
              borderRadius: 14,
              alignItems: "center",
              marginBottom: 12,
              marginTop: 8,
              flexDirection: "row",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {saving && <ActivityIndicator size="small" color="#fff" />}
            <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
              {saving ? "Creating..." : "Create Event"}
            </Text>
          </Pressable>

          {/* Back Button */}
          <Pressable
            onPress={() => router.back()}
            disabled={saving}
            style={{
              backgroundColor: "#111827",
              paddingVertical: 14,
              borderRadius: 14,
              alignItems: "center",
              marginBottom: 12,
              opacity: saving ? 0.5 : 1,
            }}
          >
            <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
              Back
            </Text>
          </Pressable>
        </View>
      </ScrollView>
  );
}
