/**
 * Public RSVP flow for /invite/{eventUuid}
 */

import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View, Pressable } from "react-native";
import { useRouter } from "expo-router";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { useBootstrap } from "@/lib/useBootstrap";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import {
  fetchPublicEventInviteSummary,
  findMemberContextForEventInvite,
  submitPublicGuestRsvp,
  submitPublicMemberRsvpByEmail,
  type PublicEventInviteSummary,
} from "@/lib/db_supabase/eventInviteRepo";
import { setMyStatus } from "@/lib/db_supabase/eventRegistrationRepo";
import {
  formatRsvpDeadlineDisplay,
  getRsvpDeadlineDisplayTimeZone,
  mapPublicRsvpError,
} from "@/lib/eventInvitePublic";

type Step = "pick" | "member" | "guest" | "done";
type DonePath = "member" | "guest" | null;

export function EventRsvpInviteScreen({ eventId }: { eventId: string }) {
  const router = useRouter();
  const colors = getColors();
  const { userId, isSignedIn } = useBootstrap();

  const [summary, setSummary] = useState<PublicEventInviteSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<Step>("pick");
  const [email, setEmail] = useState("");
  const [guestName, setGuestName] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [memberCtx, setMemberCtx] = useState<{ memberId: string; societyId: string } | null>(null);
  const [ctxResolved, setCtxResolved] = useState(false);
  const [donePath, setDonePath] = useState<DonePath>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const s = await fetchPublicEventInviteSummary(eventId);
      if (!s) {
        setLoadError("This event could not be found.");
        setSummary(null);
        return;
      }
      setSummary(s);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!summary || !userId || ctxResolved) return;
    const parts =
      summary.participant_society_ids.length > 0
        ? summary.participant_society_ids
        : [summary.host_society_id];
    void (async () => {
      const ctx = await findMemberContextForEventInvite(userId, parts, summary.host_society_id);
      setMemberCtx(ctx);
      setCtxResolved(true);
    })();
  }, [summary, userId, ctxResolved]);

  const resetFormError = () => setFormError(null);

  const assertRsvpOpen = (): boolean => {
    if (!summary?.rsvp_open) {
      setFormError(mapPublicRsvpError("rsvp_closed"));
      return false;
    }
    return true;
  };

  const mapSubmitError = (e: unknown): string => {
    if (e instanceof Error) {
      return mapPublicRsvpError(e.message);
    }
    return mapPublicRsvpError("");
  };

  const onMemberIn = async () => {
    if (!summary) return;
    resetFormError();
    if (!assertRsvpOpen()) return;
    setBusy(true);
    try {
      if (userId && memberCtx) {
        await setMyStatus({
          eventId: summary.event_id,
          societyId: memberCtx.societyId,
          memberId: memberCtx.memberId,
          status: "in",
        });
      } else {
        await submitPublicMemberRsvpByEmail(summary.event_id, email, "in");
      }
      setDonePath("member");
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[rsvp-qa] public submit ok", {
          kind: "member",
          status: "in",
          eventId: summary.event_id,
          via: userId && memberCtx ? "signed_in" : "email",
        });
      }
      setStep("done");
    } catch (e: unknown) {
      setFormError(mapSubmitError(e));
    } finally {
      setBusy(false);
    }
  };

  const onMemberOut = async () => {
    if (!summary) return;
    resetFormError();
    if (!assertRsvpOpen()) return;
    setBusy(true);
    try {
      if (userId && memberCtx) {
        await setMyStatus({
          eventId: summary.event_id,
          societyId: memberCtx.societyId,
          memberId: memberCtx.memberId,
          status: "out",
        });
      } else {
        await submitPublicMemberRsvpByEmail(summary.event_id, email, "out");
      }
      setDonePath("member");
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[rsvp-qa] public submit ok", {
          kind: "member",
          status: "out",
          eventId: summary.event_id,
          via: userId && memberCtx ? "signed_in" : "email",
        });
      }
      setStep("done");
    } catch (e: unknown) {
      setFormError(mapSubmitError(e));
    } finally {
      setBusy(false);
    }
  };

  const onGuestIn = async () => {
    if (!summary) return;
    const name = guestName.trim();
    if (!name) {
      setFormError("Please enter your name.");
      return;
    }
    resetFormError();
    if (!assertRsvpOpen()) return;
    setBusy(true);
    try {
      await submitPublicGuestRsvp(summary.event_id, name);
      setDonePath("guest");
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.log("[rsvp-qa] public submit ok", { kind: "guest", eventId: summary.event_id });
      }
      setStep("done");
    } catch (e: unknown) {
      setFormError(mapSubmitError(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Screen scrollable={false}>
        <View style={styles.centered}>
          <LoadingState message="Loading event…" />
        </View>
      </Screen>
    );
  }

  if (loadError || !summary) {
    return (
      <Screen>
        <EmptyState
          title="Event not found"
          message={loadError ?? "Check the link and try again."}
          action={{ label: "Close", onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const deadlineLabel = formatRsvpDeadlineDisplay(summary.rsvp_deadline_at);
  const rsvpDeadlineDisplayTz = getRsvpDeadlineDisplayTimeZone();
  const inviteOpen = summary.rsvp_open;

  if (step === "done") {
    const showOpenEvent = isSignedIn && donePath === "member";
    const guestSuccess = donePath === "guest";

    return (
      <Screen contentStyle={styles.pad}>
        <AppCard style={styles.card}>
          <AppText variant="h2" style={{ marginBottom: spacing.sm }}>
            {guestSuccess ? "Thanks!" : "You're set"}
          </AppText>
          <AppText variant="bodyBold" style={{ marginBottom: spacing.xs }}>
            {summary.name}
          </AppText>
          <AppText variant="small" color="secondary" style={{ marginBottom: spacing.xs }}>
            {summary.date ? summary.date : "Date TBC"}
            {summary.course_name ? ` · ${summary.course_name}` : ""}
          </AppText>
          {guestSuccess ? (
            <AppText variant="body" color="secondary" style={{ marginTop: spacing.sm }}>
              You're on the guest list. The organiser will see you in the app.
            </AppText>
          ) : (
            <AppText variant="body" color="secondary" style={{ marginTop: spacing.sm }}>
              Your RSVP is saved for this event.
            </AppText>
          )}
          {showOpenEvent ? (
            <PrimaryButton
              onPress={() =>
                router.replace({ pathname: "/(app)/event/[id]", params: { id: summary.event_id } })
              }
              style={{ marginTop: spacing.lg }}
            >
              Open event
            </PrimaryButton>
          ) : isSignedIn ? (
            <PrimaryButton
              onPress={() => router.replace("/(app)/(tabs)/events")}
              style={{ marginTop: spacing.lg }}
            >
              Open events
            </PrimaryButton>
          ) : (
            <AppText variant="small" color="muted" style={{ marginTop: spacing.lg }}>
              You can close this page.
            </AppText>
          )}
        </AppCard>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.pad}>
      <AppText variant="title" style={{ marginBottom: spacing.xs }}>
        {summary.name}
      </AppText>
      <AppText variant="small" color="secondary" style={{ marginBottom: spacing.sm }}>
        {summary.society_name}
        {summary.date ? ` · ${summary.date}` : ""}
      </AppText>
      {summary.course_name ? (
        <AppText variant="caption" color="muted" style={{ marginBottom: spacing.sm }}>
          {summary.course_name}
        </AppText>
      ) : null}

      {!inviteOpen ? (
        <InlineNotice
          variant="info"
          message={
            deadlineLabel
              ? `RSVP closed. Deadline was ${deadlineLabel}.`
              : "RSVP is closed for this event."
          }
          style={{ marginBottom: spacing.sm }}
        />
      ) : deadlineLabel ? (
        <View style={{ marginBottom: spacing.sm }}>
          <AppText variant="small" color="muted">
            RSVP closes {deadlineLabel}
            {rsvpDeadlineDisplayTz ? ` (${rsvpDeadlineDisplayTz})` : " (your local time)"}
          </AppText>
          <AppText variant="small" color="muted" style={{ marginTop: 2 }}>
            The invite stays open until the server time passes the stored deadline instant (UTC).
          </AppText>
        </View>
      ) : null}

      {step === "pick" && (
        <AppCard style={styles.card}>
          <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.sm }}>
            RSVP
          </AppText>
          {inviteOpen ? (
            <>
              <AppText variant="body" color="secondary" style={{ marginBottom: spacing.base }}>
                Member or guest?
              </AppText>
              <PrimaryButton onPress={() => setStep("member")} style={{ marginBottom: spacing.sm }}>
                I'm a member
              </PrimaryButton>
              <SecondaryButton onPress={() => setStep("guest")}>I'm a guest</SecondaryButton>
            </>
          ) : (
            <AppText variant="body" color="secondary">
              New responses aren't accepted anymore. Contact the organiser if you need help.
            </AppText>
          )}
        </AppCard>
      )}

      {step === "member" && (
        <AppCard style={styles.card}>
          <SecondaryButton
            size="sm"
            onPress={() => {
              setStep("pick");
              resetFormError();
            }}
            style={{ alignSelf: "flex-start", marginBottom: spacing.sm }}
          >
            Back
          </SecondaryButton>
          <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.sm }}>
            Member
          </AppText>

          {!inviteOpen ? (
            <AppText variant="body" color="secondary">
              RSVP is closed.
            </AppText>
          ) : !userId ? (
            <>
              <AppText variant="small" color="secondary" style={{ marginBottom: spacing.sm }}>
                Email on your society record.
              </AppText>
              <AppInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={[styles.row, { marginTop: spacing.base }]}>
                <Pressable
                  onPress={() => void onMemberIn()}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.halfBtn,
                    { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 },
                  ]}
                >
                  <AppText variant="bodyBold" color="inverse">
                    In
                  </AppText>
                </Pressable>
                <Pressable
                  onPress={() => void onMemberOut()}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.halfBtn,
                    {
                      backgroundColor: colors.backgroundTertiary,
                      borderWidth: 1,
                      borderColor: colors.border,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <AppText variant="bodyBold">Out</AppText>
                </Pressable>
              </View>
            </>
          ) : !ctxResolved ? (
            <LoadingState message="Checking membership…" />
          ) : memberCtx ? (
            <>
              <AppText variant="body" style={{ marginBottom: spacing.base }}>
                Confirm for this event.
              </AppText>
              <View style={styles.row}>
                <Pressable
                  onPress={() => void onMemberIn()}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.halfBtn,
                    { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 },
                  ]}
                >
                  <AppText variant="bodyBold" color="inverse">
                    In
                  </AppText>
                </Pressable>
                <Pressable
                  onPress={() => void onMemberOut()}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.halfBtn,
                    {
                      backgroundColor: colors.backgroundTertiary,
                      borderWidth: 1,
                      borderColor: colors.border,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <AppText variant="bodyBold">Out</AppText>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <AppText variant="body" color="secondary" style={{ marginBottom: spacing.sm }}>
                We can't match your signed-in account to this event's societies. Use your society email
                below, or open the app, switch society, and try again.
              </AppText>
              <AppInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <View style={[styles.row, { marginTop: spacing.base }]}>
                <Pressable
                  onPress={() => void onMemberIn()}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.halfBtn,
                    { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 },
                  ]}
                >
                  <AppText variant="bodyBold" color="inverse">
                    In
                  </AppText>
                </Pressable>
                <Pressable
                  onPress={() => void onMemberOut()}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.halfBtn,
                    {
                      backgroundColor: colors.backgroundTertiary,
                      borderWidth: 1,
                      borderColor: colors.border,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                >
                  <AppText variant="bodyBold">Out</AppText>
                </Pressable>
              </View>
            </>
          )}
        </AppCard>
      )}

      {step === "guest" && (
        <AppCard style={styles.card}>
          <SecondaryButton
            size="sm"
            onPress={() => {
              setStep("pick");
              resetFormError();
            }}
            style={{ alignSelf: "flex-start", marginBottom: spacing.sm }}
          >
            Back
          </SecondaryButton>
          <AppText variant="captionBold" color="secondary" style={{ marginBottom: spacing.sm }}>
            Guest
          </AppText>
          {!inviteOpen ? (
            <AppText variant="body" color="secondary">
              RSVP is closed.
            </AppText>
          ) : (
            <>
              <AppText variant="small" color="secondary" style={{ marginBottom: spacing.sm }}>
                Name for the organiser.
              </AppText>
              <AppInput
                value={guestName}
                onChangeText={setGuestName}
                placeholder="Full name"
                autoCapitalize="words"
              />
              <PrimaryButton onPress={() => void onGuestIn()} loading={busy} style={{ marginTop: spacing.base }}>
                I'm playing
              </PrimaryButton>
            </>
          )}
        </AppCard>
      )}

      {formError ? (
        <InlineNotice variant="error" message={formError} style={{ marginTop: spacing.sm }} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingTop: spacing.lg },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: { marginTop: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm },
  halfBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.base,
    borderRadius: radius.md,
    minHeight: 48,
  },
});
