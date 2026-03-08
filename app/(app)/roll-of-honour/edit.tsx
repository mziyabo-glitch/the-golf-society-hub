/**
 * Roll of Honour - Admin form to add/edit champion
 * Captain/Secretary only. Photo upload to Supabase Storage.
 */

import { useCallback, useContext, useEffect, useState } from "react";
import { StyleSheet, View, ScrollView, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { SafeAreaView } from "react-native-safe-area-context";
import { goBack } from "@/lib/navigation";

import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { PrimaryButton } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ResilientImage } from "@/components/ui/ResilientImage";
import { useBootstrap } from "@/lib/useBootstrap";
import {
  getOomChampionById,
  createOomChampion,
  updateOomChampion,
  uploadChampionPhoto,
  type OomChampionDoc,
} from "@/lib/db_supabase/oomChampionsRepo";
import { getMembersBySocietyId, type MemberDoc } from "@/lib/db_supabase/memberRepo";
import { getPermissionsForMember } from "@/lib/rbac";
import { getColors, spacing } from "@/lib/ui/theme";
import { showAlert } from "@/lib/ui/alert";
import { pickImage } from "@/utils/imagePicker";

export default function ChampionEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { societyId, member } = useBootstrap();
  const router = useRouter();
  const colors = getColors();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const canManage = getPermissionsForMember(member as any).canManageOomChampions;

  const [existing, setExisting] = useState<OomChampionDoc | null>(null);
  const [members, setMembers] = useState<MemberDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seasonYear, setSeasonYear] = useState("");
  const [memberId, setMemberId] = useState("");
  const [bio, setBio] = useState("");
  const [pointsTotal, setPointsTotal] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<{ uri: string; type?: string; name?: string } | null>(null);

  const isEdit = !!id;

  const loadData = useCallback(async () => {
    if (!societyId) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [champData, membersData] = await Promise.all([
        id ? getOomChampionById(id) : null,
        getMembersBySocietyId(societyId),
      ]);
      setExisting(champData ?? null);
      setMembers(membersData);

      if (champData) {
        setSeasonYear(String(champData.season_year));
        setMemberId(champData.member_id);
        setBio(champData.bio ?? "");
        setPointsTotal(champData.points_total != null ? String(champData.points_total) : "");
        setPhotoUri(champData.photo_url);
      } else {
        const year = new Date().getFullYear();
        setSeasonYear(String(year));
      }
    } catch (err: any) {
      console.error("[roll-of-honour edit] load error:", err);
      setError(err?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [societyId, id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePickPhoto = async () => {
    const result = await pickImage();
    if (result) {
      setPhotoUri(result.uri);
      setPhotoFile({
        uri: result.uri,
        type: result.type,
        name: "champion.jpg",
      });
    }
  };

  const handleSave = async () => {
    if (!canManage || !societyId) return;

    const year = parseInt(seasonYear.trim(), 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      showAlert("Invalid Year", "Please enter a valid season year (e.g. 2024).");
      return;
    }

    if (!memberId.trim()) {
      showAlert("Select Champion", "Please select a member.");
      return;
    }

    const pts = pointsTotal.trim() ? parseFloat(pointsTotal.trim()) : null;
    if (pointsTotal.trim() && (isNaN(pts!) || pts! < 0)) {
      showAlert("Invalid Points", "Points must be a positive number.");
      return;
    }

    setSaving(true);
    try {
      if (isEdit && existing) {
        await updateOomChampion(existing.id, {
          season_year: year,
          member_id: memberId,
          bio: bio.trim() || null,
          points_total: pts,
        });

        if (photoFile && societyId) {
          const { publicUrl } = await uploadChampionPhoto(societyId, existing.id, photoFile);
          await updateOomChampion(existing.id, { photo_url: publicUrl });
        }

        showAlert("Saved", "Champion updated.");
      } else {
        const champ = await createOomChampion(societyId, {
          season_year: year,
          member_id: memberId,
          bio: bio.trim() || null,
          points_total: pts,
        });

        if (photoFile && societyId) {
          const { publicUrl } = await uploadChampionPhoto(societyId, champ.id, photoFile);
          await updateOomChampion(champ.id, { photo_url: publicUrl });
        }

        showAlert("Added", "Champion added to Roll of Honour.");
      }
      goBack(router, "/(app)/(tabs)/leaderboard");
    } catch (err: any) {
      showAlert("Error", err?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const memberName = (m: MemberDoc) => m.displayName || m.name || m.email || "Unknown";

  if (!canManage) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
        <View style={styles.centered}>
          <EmptyState
            icon={<Feather name="lock" size={24} color={colors.textTertiary} />}
            title="Access Denied"
            message="Only Captains and Secretaries can manage the Roll of Honour."
            action={{ label: "Back", onPress: () => goBack(router, "/(app)/(tabs)/leaderboard") }}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!societyId) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
        <View style={styles.centered}>
          <EmptyState
            icon={<Feather name="users" size={24} color={colors.textTertiary} />}
            title="No Society"
            message="Select a society first."
          />
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
        <View style={styles.centered}>
          <LoadingState message="Loading..." />
        </View>
      </SafeAreaView>
    );
  }

  if (error && !existing && isEdit) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
        <View style={styles.centered}>
          <EmptyState
            icon={<Feather name="alert-circle" size={24} color={colors.error} />}
            title="Failed to Load"
            message={error}
            action={{ label: "Back", onPress: () => goBack(router, "/(app)/(tabs)/leaderboard") }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: tabBarHeight + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => goBack(router, "/(app)/(tabs)/leaderboard")} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
            <Feather name="arrow-left" size={20} color={colors.text} />
          </Pressable>
          <AppText variant="h2">{isEdit ? "Edit Champion" : "Add Champion"}</AppText>
          <View style={{ width: 24 }} />
        </View>

        <AppCard>
          {/* Photo */}
          <View style={styles.photoSection}>
            <ResilientImage
              uri={photoUri}
              style={styles.photoPreview}
              placeholderSize={100}
            />
            <PrimaryButton size="sm" onPress={handlePickPhoto}>
              {photoUri ? "Change Photo" : "Add Photo"}
            </PrimaryButton>
          </View>

          <View style={styles.formField}>
            <AppText variant="captionBold" style={styles.label}>Season Year</AppText>
            <AppInput
              placeholder="e.g. 2024"
              value={seasonYear}
              onChangeText={setSeasonYear}
              keyboardType="number-pad"
              editable={!isEdit}
            />
          </View>

          <View style={styles.formField}>
            <AppText variant="captionBold" style={styles.label}>
              Champion (Member)
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memberChips}>
              {members.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => setMemberId(m.id)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: memberId === m.id ? colors.primary + "20" : colors.backgroundSecondary,
                      borderColor: memberId === m.id ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    numberOfLines={1}
                    style={{ color: memberId === m.id ? colors.primary : colors.text }}
                  >
                    {memberName(m)}
                  </AppText>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View style={styles.formField}>
            <AppText variant="captionBold" style={styles.label}>Points (optional)</AppText>
            <AppInput
              placeholder="e.g. 125.5"
              value={pointsTotal}
              onChangeText={setPointsTotal}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.formField}>
            <AppText variant="captionBold" style={styles.label}>Bio (optional)</AppText>
            <AppInput
              placeholder="A few words about this champion..."
              value={bio}
              onChangeText={setBio}
              multiline
              numberOfLines={4}
            />
          </View>
        </AppCard>

        <PrimaryButton onPress={handleSave} disabled={saving} style={styles.saveBtn}>
          {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Champion"}
        </PrimaryButton>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.base },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  photoSection: {
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  photoPreview: {
    width: 100,
    height: 100,
    borderRadius: 12,
    marginBottom: spacing.sm,
  },
  memberChips: {
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  formField: { marginBottom: spacing.base },
  label: { marginBottom: 6 },
  saveBtn: { marginTop: spacing.lg },
});
