import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { AppText } from "@/components/ui/AppText";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import type { CourseStatusValue } from "@/lib/db_supabase/eventCourseStatusRepo";
import {
  createEventCourseStatusUpdate,
  listEventCourseStatusUpdates,
  type EventCourseStatusRow,
} from "@/lib/db_supabase/eventCourseStatusRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { COURSE_STATUS_LABEL, formatCourseStatusTimestamp } from "./courseStatusShared";

const OPTIONS: { value: CourseStatusValue; label: string; hint: string }[] = [
  { value: "open", label: "Open", hint: "Playing as normal" },
  { value: "restricted", label: "Restricted", hint: "Trolleys / paths limited" },
  { value: "temp_greens", label: "Temp greens", hint: "Winter greens in play" },
  { value: "closed", label: "Closed", hint: "No play" },
];

const HISTORY_LIMIT = 50;

type Props = {
  visible: boolean;
  onClose: () => void;
  eventId: string;
  societyId: string;
  memberId: string;
  onSubmitted: () => void;
};

function TimelineEntry({
  row,
  colors,
  isFirst,
}: {
  row: EventCourseStatusRow;
  colors: ReturnType<typeof getColors>;
  isFirst?: boolean;
}) {
  return (
    <View
      style={[
        styles.timelineRow,
        isFirst ? styles.timelineRowFirst : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight },
      ]}
    >
      <View style={[styles.statusChip, { backgroundColor: `${colors.primary}14` }]}>
        <AppText variant="captionBold" color="primary">
          {COURSE_STATUS_LABEL[row.status] ?? row.status}
        </AppText>
      </View>
      <View style={styles.timelineBody}>
        <AppText variant="small" color="tertiary">
          {formatCourseStatusTimestamp(row.created_at)}
          {row.reporterName ? ` · ${row.reporterName}` : ""}
        </AppText>
        {row.note ? (
          <AppText variant="small" color="secondary" style={{ marginTop: 6 }}>
            {row.note}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

export function CourseStatusLogModal({
  visible,
  onClose,
  eventId,
  societyId,
  memberId,
  onSubmitted,
}: Props) {
  const colors = getColors();
  const [status, setStatus] = useState<CourseStatusValue>("open");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [history, setHistory] = useState<EventCourseStatusRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!eventId) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const rows = await listEventCourseStatusUpdates(eventId, HISTORY_LIMIT);
      setHistory(rows);
    } catch (e: any) {
      setHistoryError(e?.message || "Could not load history");
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (visible && eventId) {
      setErr(null);
      void loadHistory();
    }
  }, [visible, eventId, loadHistory]);

  const submit = async () => {
    setSaving(true);
    setErr(null);
    const res = await createEventCourseStatusUpdate({
      eventId,
      societyId,
      memberId,
      status,
      note: note.trim() || null,
    });
    setSaving(false);
    if (!res.ok) {
      setErr(res.error || "Could not save");
      return;
    }
    setNote("");
    setStatus("open");
    onSubmitted();
    await loadHistory();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <View style={styles.sheetHeader}>
            <AppText variant="h2">Course status</AppText>
            <Pressable onPress={onClose} hitSlop={12}>
              <Feather name="x" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>
          <AppText variant="small" color="secondary" style={{ marginBottom: spacing.md }}>
            Full timeline for this event, newest first. Add what you heard from the club so everyone stays aligned.
          </AppText>

          <ScrollView
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.timelineHead}>
              <AppText variant="captionBold" color="secondary" style={styles.sectionEyebrow}>
                Timeline
              </AppText>
              <Pressable onPress={() => void loadHistory()} hitSlop={8} style={styles.refreshInline}>
                <Feather name="refresh-cw" size={16} color={colors.primary} />
                <AppText variant="captionBold" color="primary" style={{ marginLeft: 6 }}>
                  Refresh
                </AppText>
              </Pressable>
            </View>

            {historyLoading ? (
              <View style={styles.historyLoading}>
                <ActivityIndicator color={colors.primary} />
                <AppText variant="small" color="secondary" style={{ marginTop: spacing.sm }}>
                  Loading updates…
                </AppText>
              </View>
            ) : historyError ? (
              <AppText variant="small" style={{ color: colors.error, marginBottom: spacing.md }}>
                {historyError}
              </AppText>
            ) : history.length === 0 ? (
              <AppText variant="small" color="tertiary" style={{ marginBottom: spacing.lg }}>
                No updates yet. When you call the pro shop, post the first note below.
              </AppText>
            ) : (
              <View style={{ marginBottom: spacing.lg }}>
                {history.map((row, i) => (
                  <TimelineEntry key={row.id} row={row} colors={colors} isFirst={i === 0} />
                ))}
              </View>
            )}

            <View style={[styles.formDivider, { backgroundColor: colors.borderLight }]} />
            <AppText variant="captionBold" color="secondary" style={[styles.sectionEyebrow, { marginBottom: spacing.sm }]}>
              Add an update
            </AppText>
            <AppText variant="small" color="tertiary" style={{ marginBottom: spacing.md }}>
              After speaking with the club, choose a status and optional note.
            </AppText>

            {OPTIONS.map((o) => {
              const sel = status === o.value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => setStatus(o.value)}
                  style={[
                    styles.option,
                    {
                      borderColor: sel ? colors.primary : colors.border,
                      backgroundColor: sel ? `${colors.primary}10` : colors.backgroundSecondary,
                    },
                  ]}
                >
                  <AppText variant="bodyBold">{o.label}</AppText>
                  <AppText variant="small" color="secondary">
                    {o.hint}
                  </AppText>
                </Pressable>
              );
            })}

            <AppText variant="captionBold" color="secondary" style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>
              Note (optional)
            </AppText>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Back 9 closed until 2pm"
              placeholderTextColor={colors.textTertiary}
              multiline
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.backgroundSecondary,
                },
              ]}
            />

            {err ? (
              <AppText variant="small" style={{ color: colors.error, marginTop: spacing.sm }}>
                {err}
              </AppText>
            ) : null}

            <PrimaryButton onPress={submit} loading={saving} style={{ marginTop: spacing.md }}>
              Post update
            </PrimaryButton>
            <SecondaryButton onPress={onClose} size="md" style={{ marginTop: spacing.sm, marginBottom: spacing.md }}>
              Close
            </SecondaryButton>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    maxHeight: "92%",
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  scroll: {
    flexGrow: 0,
  },
  timelineHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  sectionEyebrow: {
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontSize: 11,
  },
  refreshInline: {
    flexDirection: "row",
    alignItems: "center",
  },
  historyLoading: {
    alignItems: "center",
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: spacing.md,
  },
  timelineRowFirst: {
    paddingTop: 0,
  },
  statusChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
  },
  timelineBody: {
    flex: 1,
    marginLeft: spacing.sm,
    minWidth: 0,
  },
  formDivider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: spacing.lg,
  },
  option: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.sm,
    minHeight: 72,
    padding: spacing.sm,
    textAlignVertical: "top",
  },
});
