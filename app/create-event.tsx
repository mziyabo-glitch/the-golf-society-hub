import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

const EVENTS_KEY = "GSOCIETY_EVENTS";

type EventData = {
  id: string;
  name: string;
  date: string;
  courseName: string;
  format: "Stableford" | "Strokeplay" | "Both";
};

export default function CreateEventScreen() {
  const router = useRouter();
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [courseName, setCourseName] = useState("");
  const [format, setFormat] = useState<"Stableford" | "Strokeplay" | "Both">("Stableford");

  const isFormValid = eventName.trim().length > 0;

  const handleSubmit = async () => {
    if (!isFormValid) return;

    try {
      // Load existing events
      const existingEventsData = await AsyncStorage.getItem(EVENTS_KEY);
      const existingEvents: EventData[] = existingEventsData
        ? JSON.parse(existingEventsData)
        : [];

      // Create new event
      const newEvent: EventData = {
        id: Date.now().toString(),
        name: eventName.trim(),
        date: eventDate.trim(),
        courseName: courseName.trim(),
        format,
      };

      // Append to array and save
      const updatedEvents = [...existingEvents, newEvent];
      await AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(updatedEvents));

      // Navigate back
      router.back();
    } catch (error) {
      console.error("Error saving event:", error);
    }
  };

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
          Event Date
        </Text>
        <TextInput
          value={eventDate}
          onChangeText={setEventDate}
          placeholder="YYYY-MM-DD"
          style={{
            backgroundColor: "#f3f4f6",
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderRadius: 14,
            fontSize: 16,
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

