/**
 * HOW TO TEST:
 * - As member: try to create event (should show alert "Access denied: Captain only" and redirect)
 * - As captain: verify can create events
 * - Create event with all fields
 * - Verify event appears on dashboard
 * 
 * WEB-ONLY PERSISTENCE: All data via Firestore, no AsyncStorage
 */

import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { getSession } from "@/lib/session";
import { canCreateEvents, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { getCurrentUserRoles } from "@/lib/roles";
import { DatePicker } from "@/components/DatePicker";
import { saveEvent } from "@/lib/firestore/society";
import type { EventData } from "@/lib/models";

export default function CreateEventScreen() {
  const router = useRouter();
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [courseName, setCourseName] = useState("");
  const [format, setFormat] = useState<"Stableford" | "Strokeplay" | "Both">("Stableford");
  const [isOOM, setIsOOM] = useState(false);
  const [role, setRole] = useState<"admin" | "member">("member");
  const [canCreate, setCanCreate] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadSession();
    }, [])
  );

  const loadSession = async () => {
    const session = await getSession();
    setRole(session.role);
    
    const sessionRole = normalizeSessionRole(session.role);
    const roles = normalizeMemberRoles(await getCurrentUserRoles());
    const canCreateEventsRole = canCreateEvents(sessionRole, roles);
    setCanCreate(canCreateEventsRole);
    
    if (!canCreateEventsRole) {
      Alert.alert("Access Denied", "Only Captain or Secretary can create events", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
  };

  if (!canCreate) {
    return null; // Will redirect via Alert
  }

  const isFormValid = eventName.trim().length > 0;

  const handleSubmit = async () => {
    if (!isFormValid) return;

    try {
      // Create new event with unique ID
      const newEvent: Partial<EventData> & { id: string } = {
        id: `event-${Date.now()}`,
        name: eventName.trim(),
        date: eventDate.trim() || new Date().toISOString(),
        courseName: courseName.trim(),
        format,
        isOOM,
        playerIds: [],
        isCompleted: false,
      };

      // Save directly to Firestore
      const success = await saveEvent(newEvent);
      
      if (success) {
        console.log("[CreateEvent] Event saved to Firestore:", newEvent.id);
        router.back();
      } else {
        Alert.alert("Error", "Failed to save event. Please try again.");
      }
    } catch (error) {
      console.error("Error saving event:", error);
      Alert.alert("Error", "Failed to create event. Please check your connection.");
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* TEMPORARY DEBUG - Remove later */}
      <View style={{ padding: 16, backgroundColor: "#f3f4f6" }}>
        <Text style={{ fontSize: 12, color: "#6b7280" }}>
          Role: {role}
        </Text>
      </View>
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
          Event Date
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
          placeholder="Enter course name"
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
          disabled={!isFormValid}
          style={{
            backgroundColor: isFormValid ? "#0B6E4F" : "#9ca3af",
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: "center",
            marginBottom: 12,
            marginTop: 8,
          }}
        >
          <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>
            Create Event
          </Text>
        </Pressable>

        {/* Back Button */}
        <Pressable
          onPress={() => router.back()}
          style={{
            backgroundColor: "#111827",
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: "center",
            marginBottom: 12,
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

