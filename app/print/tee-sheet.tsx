/**
 * Tee Sheet Print Route (Web Only)
 * 
 * This route renders the tee sheet HTML and provides a user-initiated print button.
 * User-initiated printing is more reliable on mobile browsers (Android Chrome)
 * which often block auto-triggered window.print().
 * 
 * Uses the same pure data model pattern as Season Leaderboard:
 * 1. Build data model
 * 2. Validate data model
 * 3. Render HTML from data model
 * 
 * Usage: /print/tee-sheet?eventId=xxx
 */

import { STORAGE_KEYS } from "@/lib/storage";
import type { Course, TeeSet, EventData, MemberData, GuestData } from "@/lib/models";
import { getArray } from "@/lib/storage-helpers";
import { 
  buildTeeSheetDataModel, 
  renderTeeSheetHtml, 
  validateTeeSheetData,
  type TeeSheetDataModel,
} from "@/lib/teeSheetPrint";
// Firestore read helpers (with AsyncStorage fallback)
import { getSociety, getMembers, getEvents } from "@/lib/firestore/society";
import { useLocalSearchParams, router } from "expo-router";
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";

export default function PrintTeeSheetScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();

  const [loading, setLoading] = useState(true);
  const [dataReady, setDataReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teeSheetHtml, setTeeSheetHtml] = useState<string>("");

  useEffect(() => {
    loadDataAndGenerateHtml();
  }, [eventId]);

  const loadDataAndGenerateHtml = async () => {
    setLoading(true);
    setDataReady(false);
    
    try {
      if (!eventId) {
        setError("No event ID provided");
        setLoading(false);
        return;
      }

      // Load society using Firestore helper (with AsyncStorage fallback)
      const societyData = await getSociety();
      const society = societyData ? { 
        name: societyData.name, 
        logoUrl: societyData.logoUrl 
      } : null;

      // Load events using Firestore helper (with AsyncStorage fallback)
      const events = await getEvents();
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

      // Load courses (still from AsyncStorage - not in Firestore yet)
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

      // Load members using Firestore helper (with AsyncStorage fallback)
      const members = await getMembers();

      // Guard: members should exist
      if (!members || members.length === 0) {
        console.warn("[Print Route] No members found - tee sheet may be incomplete");
      }

      // Get guests from event
      const guests: GuestData[] = (event.guests || []).map((g) => ({
        ...g,
        included: g.included ?? true,
      }));

      // Build pure data model (this handles player validation internally)
      const teeSheetData: TeeSheetDataModel = buildTeeSheetDataModel({
        society,
        event,
        course,
        maleTeeSet,
        femaleTeeSet,
        members,
        guests,
        teeGroups: event.teeSheet.groups,
        teeSheetNotes: event.teeSheetNotes,
        nearestToPinHoles: event.nearestToPinHoles,
        longestDriveHoles: event.longestDriveHoles,
      });

      // Validate data model
      const validation = validateTeeSheetData(teeSheetData);
      if (!validation.valid) {
        const errorMsg = validation.errors.join("\n");
        console.error("[Print Route] Validation failed:", validation.errors);
        setError(`Cannot generate PDF:\n${errorMsg}`);
        setLoading(false);
        return;
      }

      // Data is ready
      setDataReady(true);

      // Render HTML from data model
      const html = renderTeeSheetHtml(teeSheetData);
      setTeeSheetHtml(html);
    } catch (err) {
      console.error("[Print Route] Error loading tee sheet data:", err);
      setError("Failed to load tee sheet data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    router.back();
  };

  const handlePrint = () => {
    if (Platform.OS === "web" && typeof window !== "undefined" && window.print) {
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

  // Web: Render HTML with dangerouslySetInnerHTML and user-initiated print button
  if (Platform.OS === "web") {
    return (
      <View style={styles.webContainer}>
        {/* Print-specific CSS - hide action bar when printing */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @media print {
                .print-action-bar { display: none !important; }
                .no-print { display: none !important; }
              }
              @media screen {
                .print-action-bar {
                  position: sticky;
                  top: 0;
                  z-index: 100;
                  background: #f9fafb;
                  border-bottom: 1px solid #e5e7eb;
                  padding: 16px;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  gap: 12px;
                }
                .print-action-bar .button-row {
                  display: flex;
                  gap: 12px;
                  align-items: center;
                  flex-wrap: wrap;
                  justify-content: center;
                }
                .print-btn {
                  background-color: #0B6E4F;
                  color: white;
                  font-size: 18px;
                  font-weight: 700;
                  padding: 16px 32px;
                  border: none;
                  border-radius: 8px;
                  cursor: pointer;
                  min-width: 220px;
                }
                .print-btn:hover {
                  background-color: #095c42;
                }
                .print-btn:active {
                  background-color: #074a35;
                }
                .print-btn:disabled {
                  background-color: #9ca3af;
                  cursor: not-allowed;
                }
                .back-btn {
                  background-color: #e5e7eb;
                  color: #374151;
                  font-size: 14px;
                  font-weight: 600;
                  padding: 12px 20px;
                  border: none;
                  border-radius: 6px;
                  cursor: pointer;
                }
                .back-btn:hover {
                  background-color: #d1d5db;
                }
                .help-text {
                  font-size: 13px;
                  color: #6b7280;
                  text-align: center;
                  margin: 0;
                }
              }
            `,
          }}
        />

        {/* Action bar with print button - hidden in print */}
        <div className="print-action-bar">
          <div className="button-row">
            <button 
              className="print-btn" 
              onClick={handlePrint}
              disabled={!dataReady}
            >
              🖨️ Print / Save as PDF
            </button>
            <button className="back-btn" onClick={handleBack}>
              ← Back
            </button>
          </div>
          <p className="help-text">
            If the print dialog doesn&apos;t open, tap the button again.
          </p>
        </div>

        {/* Tee Sheet HTML Content - rendered into DOM */}
        <div
          dangerouslySetInnerHTML={{ __html: teeSheetHtml }}
          style={{ flex: 1 }}
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
});
