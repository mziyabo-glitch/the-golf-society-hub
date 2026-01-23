/**
 * HOW TO TEST:
 * - As member: try to create event (should show alert "Access denied: Captain only" and redirect)
 * - As captain: verify can create events
 * - Create event with all fields (including Event Fee)
 * - Verify event appears on dashboard
 * - Open Finance -> Events and confirm P&L uses the fee
 */

import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { canCreateEvents, normalizeMemberRoles, normalizeSessionRole } from "@/lib/permissions";
import { DatePicker } from "@/components/DatePicker";
import { useBootstrap } from "@/lib/useBootstrap";
import { createEvent } from "@/lib/db/eventRepo";
import { subscribeMemberDoc } from "@/lib/db/memberRepo";

export default function CreateEventScreen() {
  const router = useRouter();
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [courseName, setCourseName] = useState("");
  const [eventFee, setEventFee] = useState(""); // ✅ restored
  const [format, setFormat] = useState<"Stableford" | "Strokeplay" | "Both">("Stableford");
  const [isOOM, setIsOOM] = useState(false);
  const [canCreate, setCanCreate] = useState(false);
  const { user } = useBootstrap();

  useEffect(() => {
    if (!user?.activeMemberId) {
      setCanCreate(false);
      return;
    }

    const unsubscribe = subscribeMemberDoc(user.activeMemberId, (member) => {
      const sessionRole = normalizeSessionRole("member");
      const roles = normalizeMemberRoles(member?.roles);
      const canCreateEventsRole = canCreateEvents(sessionRole, roles);
      setCanCreate(canCreateEventsRole);

      if (!canCreateEventsRole) {
        Alert.alert("Access Denied", "Only Captain or Secretary can create events", [
          { text: "OK", onPress: () => router.back() },
        ]);
      }
    });

    return () => unsubscribe();
  }, [user?.activeMemberId, router]);

  const isFormValid =
    eventName.trim().length > 0 &&
    (eventFee.trim() === "" || (!Number.isNaN(Number(eventFee)) && Number(eventFee) >= 0));

  const handleSubmit = async () => {
    if (!isFormValid) return;

    try {
      if (!user?.activeSocietyId) {
        Alert.alert("Error", "No active society found");
        return;
      }

      await createEvent({
        societyId: user.activeSocietyId,
        name: eventName.trim(),
        date: eventDate.trim(),
        courseName: courseName.trim(),
        eventFee: eventFee.trim() === "" ? 0 : Number(eventFee), // ✅ persisted
        format,
        isOOM,
        status: "scheduled",
      });

      router.back();
    } catch (error) {
      console.error("Error saving event:", error);
      Alert.alert("Error", "Failed to create event. Check console for details.");
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ flex: 1, padding: 24 }}>
        <Text style={{ fontSize: 34, fontWeight: "800", marginBottom: 6 }}>Create Event</Text>
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
            marginBottom: 0,
          }}
        />

        {/* Event Fee */}
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8, marginTop: 16 }}>
          Event Fee (£)
        </Text>
        <TextInput
          value={eventFee}
          onChangeText={setEventFee}
          placeholder="0"
          keyboardType="numeric"
          style={{
            backgroundColor: "#f3f4f6",
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 14,
            fontSize: 16,
            marginBottom: 20,
          }}
        />

        {/* Date */}
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>Event Date</Text>
        <DatePicker
          value={eventDate}
          onChange={setEventDate}
          placeholder="Select date"
          style={{
            marginBottom: 20,
          }}
        />

        {/* Course Name */}
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>Course Name</Text>
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
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>Format</Text>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
          {(["Stableford", "Strokeplay", "Both"] as const).map((f) => (
            <Pressable
              key={f}
              onPress={() => setFormat(f)}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: format === f ? "#0f172a" : "#f3f4f6",
                alignItems: "center",
              }}
            >
              <Text style={{ color: format === f ? "#fff" : "#111827", fontWeight: "700" }}>
                {f}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* OOM toggle */}
        <Pressable
          onPress={() => setIsOOM((v) => !v)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 14,
            borderRadius: 14,
            backgroundColor: "#f3f4f6",
            marginBottom: 24,
          }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              marginRight: 12,
              backgroundColor: isOOM ? "#16a34a" : "#d1d5db",
            }}
          />
          <Text style={{ fontSize: 16, fontWeight: "700" }}>Counts toward Order of Merit</Text>
        </Pressable>

        {/* Save */}
        <Pressable
          onPress={handleSubmit}
          disabled={!canCreate || !isFormValid}
          style={{
            backgroundColor: canCreate && isFormValid ? "#2F6F62" : "#9ca3af",
            paddingVertical: 16,
            borderRadius: 16,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>Create Event</Text>
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          style={{ paddingVertical: 16, alignItems: "center", marginTop: 14 }}
        >
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#0f172a" }}>Back</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

