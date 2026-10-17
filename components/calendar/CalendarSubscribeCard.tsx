import { useCallback, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Feather } from "@expo/vector-icons";

import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { Toast } from "@/components/ui/Toast";
import { useBootstrap } from "@/lib/useBootstrap";
import { getCalendarSubscribeUrl } from "@/lib/appConfig";
import { ensureCalendarFeedToken, rotateCalendarFeedToken } from "@/lib/db_supabase/calendarFeedRepo";
import { explainCalendarFeedRpcError } from "@/lib/calendarFeedErrors";
import { trackFeatureTapped } from "@/lib/analytics/trackEvent";
import { getColors, spacing } from "@/lib/ui/theme";
import { confirmDestructive } from "@/lib/ui/alert";

type Props = {
  compact?: boolean;
};

export function CalendarSubscribeCard({ compact }: Props) {
  const { society, member, societyId } = useBootstrap();
  const colors = getColors();
  const memberId = member?.id ?? null;

  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [resetToast, setResetToast] = useState(false);

  const open = useCallback(async () => {
    trackFeatureTapped("subscribe_society_calendar", { screen: "events", societyId: societyId ?? undefined });
    setVisible(true);
    setUrl(null);
    setError(null);
    if (!society?.id || !memberId) {
      setError("You need an active member profile in this society to create a calendar link.");
      return;
    }
    setLoading(true);
    try {
      const token = await ensureCalendarFeedToken(society.id, memberId);
      setUrl(getCalendarSubscribeUrl(token));
    } catch (e: unknown) {
      setError(explainCalendarFeedRpcError(e, "Could not create calendar link"));
    } finally {
      setLoading(false);
    }
  }, [society?.id, memberId, societyId]);

  return (
    <>
      <Pressable onPress={() => void open()}>
        <AppCard style={[styles.card, compact ? styles.cardCompact : null]}>
          <View style={styles.row}>
            <View style={[styles.icon, { backgroundColor: colors.primary + "18" }]}>
              <Feather name="calendar" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="bodyBold">Subscribe to Society Calendar</AppText>
              <AppText variant="small" color="secondary" numberOfLines={2}>
                iPhone, Google, or Outlook — events where your RSVP is In
              </AppText>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textTertiary} />
          </View>
        </AppCard>
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <View style={[styles.modal, { backgroundColor: colors.background }]} onStartShouldSetResponder={() => true}>
            <AppText variant="title" style={{ marginBottom: spacing.sm }}>
              Subscribe to Society Calendar
            </AppText>
            {loading ? (
              <LoadingState message="Creating link…" />
            ) : error ? (
              <InlineNotice variant="error" message={error} />
            ) : url ? (
              <>
                <SecondaryButton
                  onPress={async () => {
                    const ok = await Clipboard.setStringAsync(url);
                    if (ok) setCopied(true);
                  }}
                  style={{ marginBottom: spacing.sm }}
                >
                  Copy calendar URL
                </SecondaryButton>
                <AppText variant="caption" color="muted" selectable style={{ marginBottom: spacing.md }}>
                  {url}
                </AppText>
                <SecondaryButton
                  loading={rotating}
                  disabled={rotating || !societyId || !memberId}
                  onPress={() => {
                    void confirmDestructive(
                      "Reset calendar link?",
                      "The old link stops working immediately. Remove the old subscription in your calendar app, then subscribe again with the new link.",
                      "Reset",
                      async () => {
                        if (!societyId || !memberId) return;
                        setRotating(true);
                        setError(null);
                        try {
                          const token = await rotateCalendarFeedToken(societyId, memberId);
                          setUrl(getCalendarSubscribeUrl(token));
                          setResetToast(true);
                        } catch (e: unknown) {
                          setError(explainCalendarFeedRpcError(e, "Could not reset link"));
                        } finally {
                          setRotating(false);
                        }
                      },
                    );
                  }}
                >
                  Reset calendar link
                </SecondaryButton>
              </>
            ) : null}
            <SecondaryButton onPress={() => setVisible(false)} style={{ marginTop: spacing.md }}>
              Close
            </SecondaryButton>
          </View>
        </Pressable>
      </Modal>

      <Toast visible={copied} message="Calendar URL copied" type="success" onHide={() => setCopied(false)} />
      <Toast visible={resetToast} message="Calendar link reset — use the new URL" type="success" onHide={() => setResetToast(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
    padding: spacing.sm,
  },
  cardCompact: {
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modal: {
    borderRadius: 12,
    padding: spacing.lg,
    maxWidth: 480,
    alignSelf: "center",
    width: "100%",
  },
});
