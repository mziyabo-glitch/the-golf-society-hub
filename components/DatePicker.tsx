/**
 * Simple Date Picker Component
 * Works on web (HTML5 input) and mobile (modal with inputs)
 */

import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type DatePickerProps = {
  value: string; // ISO format (YYYY-MM-DD)
  onChange: (value: string) => void;
  placeholder?: string;
  style?: any;
};

export function DatePicker({ value, onChange, placeholder = "YYYY-MM-DD", style }: DatePickerProps) {
  const [showModal, setShowModal] = useState(false);
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");

  // Parse current value to day/month/year
  const parseValue = (val: string) => {
    if (!val) return { day: "", month: "", year: "" };
    try {
      const date = new Date(val);
      if (!isNaN(date.getTime())) {
        return {
          day: String(date.getDate()).padStart(2, "0"),
          month: String(date.getMonth() + 1).padStart(2, "0"),
          year: String(date.getFullYear()),
        };
      }
      // Try parsing as YYYY-MM-DD
      const parts = val.split("-");
      if (parts.length === 3) {
        return {
          day: parts[2],
          month: parts[1],
          year: parts[0],
        };
      }
    } catch {
      // Ignore
    }
    return { day: "", month: "", year: "" };
  };

  const handleOpen = () => {
    const parsed = parseValue(value);
    setDay(parsed.day);
    setMonth(parsed.month);
    setYear(parsed.year);
    setShowModal(true);
  };

  const handleSave = () => {
    if (day && month && year) {
      const dayNum = parseInt(day, 10);
      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);
      
      if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900 && yearNum < 2100) {
        const isoDate = `${yearNum}-${String(monthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
        onChange(isoDate);
      }
    }
    setShowModal(false);
  };

  const handleCancel = () => {
    setShowModal(false);
  };

  // All platforms: Use modal with inputs (consistent UX)
  return (
    <>
      <Pressable onPress={handleOpen} style={[styles.input, style]}>
        <Text style={value ? styles.inputText : styles.placeholderText}>
          {value ? parseValue(value).day + "-" + parseValue(value).month + "-" + parseValue(value).year : placeholder}
        </Text>
      </Pressable>

      <Modal visible={showModal} transparent animationType="fade" onRequestClose={handleCancel}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Date</Text>
            
            <View style={styles.dateInputs}>
              <View style={styles.dateInputGroup}>
                <Text style={styles.dateLabel}>Day</Text>
                <TextInput
                  value={day}
                  onChangeText={setDay}
                  placeholder="DD"
                  keyboardType="numeric"
                  maxLength={2}
                  style={styles.dateInput}
                />
              </View>
              <View style={styles.dateInputGroup}>
                <Text style={styles.dateLabel}>Month</Text>
                <TextInput
                  value={month}
                  onChangeText={setMonth}
                  placeholder="MM"
                  keyboardType="numeric"
                  maxLength={2}
                  style={styles.dateInput}
                />
              </View>
              <View style={styles.dateInputGroup}>
                <Text style={styles.dateLabel}>Year</Text>
                <TextInput
                  value={year}
                  onChangeText={setYear}
                  placeholder="YYYY"
                  keyboardType="numeric"
                  maxLength={4}
                  style={styles.dateInput}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable onPress={handleCancel} style={styles.modalCancelButton}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSave} style={styles.modalSaveButton}>
                <Text style={styles.modalSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: "#f3f4f6",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    justifyContent: "center",
    minHeight: 48,
  },
  inputText: {
    fontSize: 16,
    color: "#111827",
  },
  placeholderText: {
    fontSize: 16,
    color: "#9ca3af",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 20,
    textAlign: "center",
  },
  dateInputs: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  dateInputGroup: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  dateInput: {
    backgroundColor: "#f9fafb",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    textAlign: "center",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
  },
  modalCancelText: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "600",
  },
  modalSaveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#0B6E4F",
    alignItems: "center",
  },
  modalSaveText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});

