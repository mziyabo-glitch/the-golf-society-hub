import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { AppInput } from "@/components/ui/AppInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { InlineNotice } from "@/components/ui/InlineNotice";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { LicenceRequiredModal } from "@/components/LicenceRequiredModal";
import { useBootstrap } from "@/lib/useBootstrap";
import { usePaidAccess } from "@/lib/access/usePaidAccess";
import { getColors, radius, spacing } from "@/lib/ui/theme";
import { getMembersBySocietyId, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import { getTeesByCourseId, searchCourses, type CourseSearchHit, type CourseTee } from "@/lib/db_supabase/courseRepo";
import {
  createFreePlayRound,
  joinFreePlayRoundByCode,
  listMyFreePlayRounds,
} from "@/lib/db_supabase/freePlayScorecardRepo";
import type { FreePlayRound, FreePlayScoringMode } from "@/types/freePlayScorecard";

type DraftPlayer = {
  id: string;
  kind: "member" | "app_user" | "guest";
  displayName: string;
  inviteEmail: string;
  handicapIndex: string;
  memberId?: string | null;
  userId?: string | null;
};

export default function FreePlayHomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ join?: string | string[]; joinCode?: string | string[] }>();
  const colors = getColors();
  const { societyId, member, userId } = useBootstrap();
  const { needsLicence, guardPaidAction, modalVisible, setModalVisible, societyId: guardSocietyId } = usePaidAccess();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rounds, setRounds] = useState<FreePlayRound[]>([]);
  const [members, setMembers] = useState<MemberDoc[]>([]);

  const [joinCode, setJoinCode] = useState("");
  const [courseQuery, setCourseQuery] = useState("");
  const [courseHits, setCourseHits] = useState<CourseSearchHit[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<CourseSearchHit | null>(null);
  const [tees, setTees] = useState<CourseTee[]>([]);
  const [selectedTeeId, setSelectedTeeId] = useState<string | null>(null);
  const [scoringMode, setScoringMode] = useState<FreePlayScoringMode>("quick");
  const [draftPlayers, setDraftPlayers] = useState<DraftPlayer[]>([]);
  const [showMemberPicker, setShowMemberPicker] = useState(false);

  const joinPrefill = useMemo(() => {
    const raw = params.join;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params.join]);
  const joinCodePrefill = useMemo(() => {
    const raw = params.joinCode;
    return Array.isArray(raw) ? raw[0] : raw;
  }, [params.joinCode]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [myRounds, memberRows] = await Promise.all([
        listMyFreePlayRounds(),
        societyId ? getMembersBySocietyId(societyId) : Promise.resolve([]),
      ]);
      setRounds(myRounds);
      setMembers(memberRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load free-play rounds.");
    } finally {
      setLoading(false);
    }
  }, [societyId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedCourse?.id) {
      setTees([]);
      setSelectedTeeId(null);
      return;
    }
    let cancelled = false;
    void getTeesByCourseId(selectedCourse.id)
      .then((list) => {
        if (cancelled) return;
        setTees(list);
        setSelectedTeeId(list[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setTees([]);
          setSelectedTeeId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCourse?.id]);

  useEffect(() => {
    const q = courseQuery.trim();
    if (q.length < 2) {
      setCourseHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void searchCourses(q, 20).then(({ data }) => {
        if (!cancelled) setCourseHits(data ?? []);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [courseQuery]);

  useEffect(() => {
    if (joinPrefill === "1") {
      setShowMemberPicker(false);
    }
  }, [joinPrefill]);

  useEffect(() => {
    if (!joinCodePrefill?.trim()) return;
    setJoinCode(joinCodePrefill.trim().toUpperCase());
  }, [joinCodePrefill]);

  const ownerName = String(member?.displayName || member?.name || "You");
  const ownerHcp = member?.handicapIndex ?? member?.handicap_index ?? 0;

  const addDraftPlayer = useCallback((kind: DraftPlayer["kind"]) => {
    const id = `${kind}-${Date.now()}-${Math.round(Math.random() * 1e4)}`;
    setDraftPlayers((prev) => [
      ...prev,
      {
        id,
        kind,
        displayName: "",
        inviteEmail: "",
        handicapIndex: "0",
      },
    ]);
  }, []);

  const addMemberPlayer = useCallback(
    (m: MemberDoc) => {
      const exists = draftPlayers.some((p) => p.memberId && p.memberId === m.id);
      if (exists) return;
      const h = m.handicapIndex ?? m.handicap_index ?? 0;
      setDraftPlayers((prev) => [
        ...prev,
        {
          id: `member-${m.id}`,
          kind: "member",
          displayName: String(m.displayName || m.name || "Member"),
          inviteEmail: "",
          handicapIndex: String(Number.isFinite(Number(h)) ? Number(h) : 0),
          memberId: m.id,
          userId: m.user_id ?? null,
        },
      ]);
    },
    [draftPlayers],
  );

  const removeDraftPlayer = useCallback((id: string) => {
    setDraftPlayers((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const updateDraftPlayer = useCallback((id: string, patch: Partial<DraftPlayer>) => {
    setDraftPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const handleCreate = useCallback(async () => {
    if (!guardPaidAction()) return;
    if (!selectedCourse?.id) {
      setError("Pick a course first.");
      return;
    }
    if (tees.length > 0 && !selectedTeeId) {
      setError("Pick a tee first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const ownerPlayer = {
        playerType: member?.id ? ("member" as const) : ("app_user" as const),
        displayName: ownerName,
        memberId: member?.id ?? null,
        userId: userId ?? null,
        handicapIndex: Number(ownerHcp) || 0,
        inviteStatus: "joined" as const,
        isOwner: true,
        sortOrder: 0,
      };
      const extraPlayers = draftPlayers
        .filter((p) => p.displayName.trim().length > 0 || p.memberId)
        .map((p, i) => ({
          playerType: p.kind,
          displayName: p.displayName.trim() || (p.kind === "guest" ? `Guest ${i + 1}` : "Player"),
          memberId: p.memberId ?? null,
          userId: p.userId ?? null,
          inviteEmail: p.inviteEmail.trim() || null,
          handicapIndex: Number.isFinite(Number(p.handicapIndex)) ? Number(p.handicapIndex) : 0,
          inviteStatus: p.kind === "app_user" && p.inviteEmail.trim() ? ("invited" as const) : ("none" as const),
          sortOrder: i + 1,
        }));
      const tee = tees.find((t) => t.id === selectedTeeId) ?? null;
      const round = await createFreePlayRound({
        societyId: societyId ?? null,
        createdByMemberId: member?.id ?? null,
        courseId: selectedCourse.id,
        courseName: selectedCourse.name,
        teeId: tees.length > 0 ? selectedTeeId : null,
        teeName: tees.length > 0 ? tee?.tee_name ?? null : "General",
        scoringMode,
        players: [ownerPlayer, ...extraPlayers],
      });
      router.push({ pathname: "/(app)/free-play/[id]", params: { id: round.id, created: "1", openAdd: "1" } } as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create round.");
    } finally {
      setSaving(false);
    }
  }, [
    guardPaidAction,
    selectedCourse,
    selectedTeeId,
    member?.id,
    ownerName,
    ownerHcp,
    userId,
    draftPlayers,
    tees,
    societyId,
    scoringMode,
    router,
  ]);

  const handleJoinByCode = useCallback(async () => {
    if (!joinCode.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const round = await joinFreePlayRoundByCode(joinCode, ownerName);
      router.push({ pathname: "/(app)/free-play/[id]", params: { id: round.id } } as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join round.");
    } finally {
      setSaving(false);
    }
  }, [joinCode, ownerName, router]);

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Loading free-play scorecards…" />
      </Screen>
    );
  }

  return (
    <Screen style={{ backgroundColor: colors.backgroundSecondary }}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <AppText variant="h1">Free Play Scorecard</AppText>
        <AppText variant="small" color="secondary" style={{ marginTop: spacing.xs, marginBottom: spacing.md }}>
          Personal and social rounds not tied to events.
        </AppText>

        {error ? <InlineNotice variant="error" message={error} style={{ marginBottom: spacing.md }} /> : null}

        <AppCard style={styles.card}>
          <AppText variant="captionBold" color="muted">
            Join a round
          </AppText>
          <View style={styles.row}>
            <AppInput
              value={joinCode}
              onChangeText={setJoinCode}
              placeholder="Enter join code"
              autoCapitalize="characters"
              style={{ flex: 1 }}
            />
            <PrimaryButton label="Join" onPress={handleJoinByCode} loading={saving} />
          </View>
        </AppCard>

        <AppCard style={styles.card}>
          <AppText variant="captionBold" color="muted">
            New round setup
          </AppText>

          {needsLicence ? (
            <InlineNotice
              variant="info"
              message="Premium needed to create/start free-play rounds. You can still join and view shared rounds."
              style={{ marginTop: spacing.sm }}
            />
          ) : null}

          <AppInput
            value={courseQuery}
            onChangeText={setCourseQuery}
            placeholder="Search course"
            style={{ marginTop: spacing.sm }}
          />
          {courseHits.slice(0, 6).map((c) => (
            <Pressable
              key={c.id}
              onPress={() => {
                setSelectedCourse(c);
                setCourseQuery(c.name);
                setCourseHits([]);
              }}
              style={({ pressed }) => [styles.selectRow, { opacity: pressed ? 0.85 : 1, borderColor: colors.borderLight }]}
            >
              <AppText variant="bodyBold">{c.name}</AppText>
              {!!c.location ? <AppText variant="small" color="secondary">{c.location}</AppText> : null}
            </Pressable>
          ))}

          {selectedCourse ? (
            <View style={{ marginTop: spacing.sm }}>
              <AppText variant="small" color="secondary">Tees</AppText>
              {tees.length > 0 ? (
                <View style={styles.wrap}>
                  {tees.map((t) => (
                    <Pressable
                      key={t.id}
                      onPress={() => setSelectedTeeId(t.id)}
                      style={[
                        styles.chip,
                        {
                          borderColor: t.id === selectedTeeId ? colors.primary : colors.borderLight,
                          backgroundColor: t.id === selectedTeeId ? `${colors.primary}16` : colors.surface,
                        },
                      ]}
                    >
                      <AppText variant="captionBold" color={t.id === selectedTeeId ? "primary" : "secondary"}>
                        {t.tee_name}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <InlineNotice
                  variant="info"
                  message="No tee data found for this course yet. You can still create the round with a general tee."
                  style={{ marginTop: spacing.xs }}
                />
              )}
            </View>
          ) : null}

          <View style={{ marginTop: spacing.sm }}>
            <AppText variant="small" color="secondary">Scoring mode</AppText>
            <View style={styles.wrap}>
              {(["quick", "hole_by_hole"] as const).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setScoringMode(m)}
                  style={[
                    styles.chip,
                    {
                      borderColor: scoringMode === m ? colors.primary : colors.borderLight,
                      backgroundColor: scoringMode === m ? `${colors.primary}16` : colors.surface,
                    },
                  ]}
                >
                  <AppText variant="captionBold" color={scoringMode === m ? "primary" : "secondary"}>
                    {m === "quick" ? "Quick entry" : "Hole-by-hole"}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={{ marginTop: spacing.md }}>
            <AppText variant="small" color="secondary">Players</AppText>
            <AppText variant="caption" color="tertiary" style={{ marginTop: 2 }}>
              You are added automatically as the round owner.
            </AppText>
            <View style={[styles.row, { marginTop: spacing.sm }]}>
              <SecondaryButton label="Add member" onPress={() => setShowMemberPicker((v) => !v)} />
              <SecondaryButton label="Add app user" onPress={() => addDraftPlayer("app_user")} />
              <SecondaryButton label="Add guest" onPress={() => addDraftPlayer("guest")} />
            </View>

            {showMemberPicker ? (
              <View style={{ marginTop: spacing.sm }}>
                {members.slice(0, 20).map((m) => (
                  <Pressable
                    key={m.id}
                    onPress={() => addMemberPlayer(m)}
                    style={({ pressed }) => [styles.selectRow, { opacity: pressed ? 0.85 : 1, borderColor: colors.borderLight }]}
                  >
                    <AppText variant="bodyBold">{String(m.displayName || m.name || "Member")}</AppText>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {draftPlayers.map((p) => (
              <View key={p.id} style={[styles.playerCard, { borderColor: colors.borderLight }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <AppText variant="captionBold" color="muted">
                    {p.kind === "member" ? "Society member" : p.kind === "app_user" ? "App user invite" : "Guest"}
                  </AppText>
                  <Pressable onPress={() => removeDraftPlayer(p.id)} hitSlop={8}>
                    <Feather name="x" size={16} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <AppInput
                  value={p.displayName}
                  onChangeText={(v) => updateDraftPlayer(p.id, { displayName: v })}
                  placeholder="Player name"
                  style={{ marginTop: spacing.xs }}
                  editable={!p.memberId}
                />
                {p.kind === "app_user" ? (
                  <AppInput
                    value={p.inviteEmail}
                    onChangeText={(v) => updateDraftPlayer(p.id, { inviteEmail: v })}
                    placeholder="Invite email (optional)"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    style={{ marginTop: spacing.xs }}
                  />
                ) : null}
                <AppInput
                  value={p.handicapIndex}
                  onChangeText={(v) => updateDraftPlayer(p.id, { handicapIndex: v })}
                  placeholder="Handicap index"
                  keyboardType="numeric"
                  style={{ marginTop: spacing.xs }}
                />
              </View>
            ))}
          </View>

          <PrimaryButton
            label="Create free-play round"
            onPress={handleCreate}
            loading={saving}
            style={{ marginTop: spacing.md }}
          />
        </AppCard>

        <AppText variant="captionBold" color="muted" style={{ marginBottom: spacing.sm }}>
          My rounds
        </AppText>
        {rounds.length === 0 ? (
          <EmptyState title="No free-play rounds yet" message="Create one in two taps, or join with a code." />
        ) : (
          rounds.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => router.push({ pathname: "/(app)/free-play/[id]", params: { id: r.id } } as never)}
              style={({ pressed }) => [
                styles.roundRow,
                {
                  opacity: pressed ? 0.85 : 1,
                  borderColor: colors.borderLight,
                  backgroundColor: colors.surface,
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">{r.course_name}</AppText>
                <AppText variant="small" color="secondary">
                  {r.tee_name || "Tee"} · {r.status.replace("_", " ")} · code {r.join_code}
                </AppText>
              </View>
              <Feather name="chevron-right" size={18} color={colors.textSecondary} />
            </Pressable>
          ))
        )}
      </ScrollView>
      <LicenceRequiredModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        societyId={guardSocietyId}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: spacing.base,
    paddingBottom: spacing.xl,
  },
  card: {
    marginBottom: spacing.base,
    padding: spacing.base,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  chip: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  selectRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  playerCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  roundRow: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.base,
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
});
