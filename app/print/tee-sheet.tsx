/**
 * Tee Sheet Print Route (Web Only)
 * 
 * This route renders the tee sheet HTML and auto-triggers window.print().
 * It's designed for reliable web printing on Chrome/Android and desktop browsers.
 * 
 * Usage: /print/tee-sheet?eventId=xxx
 */

import { STORAGE_KEYS } from "@/lib/storage";
import type { Course, TeeSet, EventData, MemberData } from "@/lib/models";
import { getArray } from "@/lib/storage-helpers";
import { generateTeeSheetHtml } from "@/lib/teeSheetPrint";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, router } from "expo-router";
import { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";

type GuestData = {
  id: string;
  name: string;
  sex: "male" | "female";
  handicapIndex?: number;
  included: boolean;
};

type SocietyData = {
  name: string;
  logoUrl?: string | null;
};

export default function PrintTeeSheetScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teeSheetHtml, setTeeSheetHtml] = useState<string>("");
  const printTriggered = useRef(false);

  useEffect(() => {
    loadDataAndGenerateHtml();
  }, [eventId]);

  // Auto-trigger print after HTML is rendered (web only)
  useEffect(() => {
    if (!loading && !error && teeSheetHtml && Platform.OS === "web" && !printTriggered.current) {
      printTriggered.current = true;
      // Use requestAnimationFrame + setTimeout for reliable rendering
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (typeof window !== "undefined" && window.print) {
            window.print();
          }
        }, 400);
      });
    }
  }, [loading, error, teeSheetHtml]);

  const loadDataAndGenerateHtml = async () => {
    try {
      if (!eventId) {
        setError("No event ID provided");
        setLoading(false);
        return;
      }

      // Load society
      let society: SocietyData | null = null;
      const societyData = await AsyncStorage.getItem(STORAGE_KEYS.SOCIETY_ACTIVE);
      if (societyData) {
        try {
          society = JSON.parse(societyData);
        } catch (e) {
          console.error("Error parsing society:", e);
        }
      }

      // Load events
      const events = await getArray<EventData>(STORAGE_KEYS.EVENTS, []);
      const event = events.find((e) => e.id === eventId);

      if (!event) {
        setError("Event not found");
        setLoading(false);
        return;
      }

      if (!event.teeSheet || !event.teeSheet.groups || event.teeSheet.groups.length === 0) {
        setError("No tee sheet found for this event. Please generate a tee sheet first.");
        setLoading(false);
        return;
      }

      // Load courses
      const courses = await getArray<Course>(STORAGE_KEYS.COURSES, []);
      let course: Course | null = null;
      let maleTeeSet: TeeSet | null = null;
      let femaleTeeSet: TeeSet | null = null;

      if (event.courseId) {
        course = courses.find((c) => c.id === event.courseId) || null;
        if (course) {
          if (event.maleTeeSetId) {
            maleTeeSet = course.teeSets.find((t) => t.id === event.maleTeeSetId) || null;
          }
          if (event.femaleTeeSetId) {
            femaleTeeSet = course.teeSets.find((t) => t.id === event.femaleTeeSetId) || null;
          }
        }
      }

      // Load members
      const members = await getArray<MemberData>(STORAGE_KEYS.MEMBERS, []);

      // Get guests from event
      const guests: GuestData[] = event.guests || [];

      // Get tee sheet data
      const teeGroups = event.teeSheet.groups || [];
      const teeSheetNotes = event.teeSheetNotes || "";
      const nearestToPinHoles = event.nearestToPinHoles || [];
      const longestDriveHoles = event.longestDriveHoles || [];
      const handicapAllowancePct = event.handicapAllowancePct ?? (event.handicapAllowance === 1.0 ? 100 : 90);

      // Generate HTML using shared generator
      const html = generateTeeSheetHtml({
        society,
        event,
        course,
        maleTeeSet,
        femaleTeeSet,
        members,
        guests: guests.filter((g) => g.included),
        teeGroups,
        teeSheetNotes,
        nearestToPinHoles,
        longestDriveHoles,
        handicapAllowancePct,
      });

      setTeeSheetHtml(html);
    } catch (err) {
      console.error("Error loading tee sheet data:", err);
      setError("Failed to load tee sheet data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    router.back();
  };

  const handlePrintAgain = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.print();
    }
  };

  // Loading state
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.loadingText}>Loading tee sheet...</Text>
        </View>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorTitle}>Unable to Load Tee Sheet</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back to Tee Sheet</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Web: Render HTML with dangerouslySetInnerHTML
  if (Platform.OS === "web") {
    return (
      <View style={styles.webContainer}>
        {/* Back bar - hidden in print */}
        <View style={styles.noPrintBar}>
          <Pressable onPress={handleBack} style={styles.backLink}>
            <Text style={styles.backLinkText}>← Back to Tee Sheet</Text>
          </Pressable>
          <Pressable onPress={handlePrintAgain} style={styles.printAgainButton}>
            <Text style={styles.printAgainText}>Print Again</Text>
          </Pressable>
        </View>

        {/* Tee Sheet HTML Content */}
        <div
          dangerouslySetInnerHTML={{ __html: teeSheetHtml }}
          style={{ flex: 1 }}
        />

        {/* Print-specific CSS */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @media print {
                .no-print-bar { display: none !important; }
              }
            `,
          }}
        />
      </View>
    );
  }

  // Native: Show message (this route is primarily for web)
  return (
    <View style={styles.container}>
      <View style={styles.centerContent}>
        <Text style={styles.errorText}>
          This print view is designed for web browsers.
          On mobile, please use the Share PDF button from the Tee Sheet screen.
        </Text>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  webContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#dc2626",
    marginBottom: 12,
    textAlign: "center",
  },
  errorText: {
    fontSize: 16,
    color: "#6b7280",
    marginBottom: 24,
    textAlign: "center",
    maxWidth: 400,
  },
  backButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  backButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  noPrintBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#f9fafb",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    // @ts-ignore - web className for print hiding
    className: "no-print-bar",
  },
  backLink: {
    padding: 8,
  },
  backLinkText: {
    fontSize: 14,
    color: "#0B6E4F",
    fontWeight: "600",
  },
  printAgainButton: {
    backgroundColor: "#0B6E4F",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  printAgainText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
