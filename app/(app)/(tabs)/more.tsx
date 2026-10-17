/**
 * More hub — Phase 2 simplified sections:
 * Society · Events and tools · ManCo · Platform administration
 */

import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { useBootstrap } from "@/lib/useBootstrap";
import { getPermissionsForMember, isCaptain, isSecretary } from "@/lib/rbac";
import { isPlatformAdmin } from "@/lib/db_supabase/adminRepo";
import { getColors, spacing, radius } from "@/lib/ui/theme";
import { blurWebActiveElement } from "@/lib/ui/focus";

type RowProps = {
  icon: keyof typeof Feather.glyphMap;
  iconBg: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  colors: ReturnType<typeof getColors>;
};

function MenuRow({ icon, iconBg, title, subtitle, onPress, colors }: RowProps) {
  return (
    <Pressable
      onPress={() => {
        try {
          blurWebActiveElement();
        } catch {
          /* ignore */
        }
        onPress();
      }}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.75 : 1 }]}
    >
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="bodyBold" numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="small" color="secondary" style={{ marginTop: 2 }} numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      <Feather name="chevron-right" size={20} color={colors.textTertiary} />
    </Pressable>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <AppText variant="captionBold" color="muted" style={styles.sectionTitle}>
      {children}
    </AppText>
  );
}

function Divider({ colors }: { colors: ReturnType<typeof getColors> }) {
  return <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />;
}

export default function MoreScreen() {
  const router = useRouter();
  const { member, activeSocietyId } = useBootstrap();
  const colors = getColors();
  const tabBarHeight = useBottomTabBarHeight();
  const contentPad = { paddingTop: spacing.md, paddingBottom: tabBarHeight + spacing.xl };

  const hasSociety = !!activeSocietyId && !!member;
  const hasFullAccess =
    hasSociety && (isCaptain(member as any) || (member as any)?.has_seat === true);

  const permissions = getPermissionsForMember(member);
  const captain = isCaptain(member as any);
  const secretary = isSecretary(member as any);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    void isPlatformAdmin().then(setIsAdmin);
  }, []);

  const push = useCallback(
    (href: string) => {
      router.push(href as any);
    },
    [router],
  );

  const isManCo =
    captain || secretary || permissions.canGenerateTeeSheet || permissions.canManageHandicaps;
  const showManCo =
    hasFullAccess &&
    (isManCo || permissions.canAccessFinance || captain);

  return (
    <Screen scrollable={false} style={{ backgroundColor: colors.backgroundSecondary }}>
      <ScrollView contentContainerStyle={[styles.scrollContent, contentPad]} keyboardShouldPersistTaps="handled">
        <AppText variant="title" style={styles.pageTitle}>
          More
        </AppText>
        <AppText variant="small" color="secondary" style={styles.pageSub}>
          Society settings, secondary tools, and administration
        </AppText>

        <SectionTitle>Society</SectionTitle>
        <AppCard style={styles.card}>
          {hasFullAccess ? (
            <MenuRow
              icon="users"
              iconBg={`${colors.primary}16`}
              title="Members"
              subtitle="Roster, roles, and member details"
              colors={colors}
              onPress={() => push("/(app)/(tabs)/members")}
            />
          ) : (
            <View style={styles.mutedBlock}>
              <Feather name="info" size={16} color={colors.textTertiary} />
              <AppText variant="small" color="tertiary" style={{ flex: 1, marginLeft: spacing.sm }}>
                {hasSociety
                  ? "A society seat is required for the member directory."
                  : "Join a society with a seat to access the member directory."}
              </AppText>
            </View>
          )}
          <Divider colors={colors} />
          <MenuRow
            icon="settings"
            iconBg={colors.backgroundTertiary}
            title="Society settings"
            subtitle="Invites, privacy, text size, and society options"
            colors={colors}
            onPress={() => push("/(app)/(tabs)/settings")}
          />
          <Divider colors={colors} />
          <MenuRow
            icon="user"
            iconBg={colors.backgroundTertiary}
            title="My profile"
            subtitle="Name, handicap, and preferences"
            colors={colors}
            onPress={() => push("/(app)/my-profile")}
          />
          {hasSociety ? (
            <>
              <Divider colors={colors} />
              <MenuRow
                icon="zap"
                iconBg={`${colors.warning}20`}
                title="Rivalries"
                subtitle="Sinbook challenges and head-to-heads"
                colors={colors}
                onPress={() => push("/(app)/(tabs)/sinbook")}
              />
            </>
          ) : null}
        </AppCard>

        <SectionTitle>Events and tools</SectionTitle>
        <AppCard style={styles.card}>
          {hasSociety ? (
            <MenuRow
              icon="calendar"
              iconBg={`${colors.info}18`}
              title="Subscribe to calendar"
              subtitle="Add society events to your calendar app"
              colors={colors}
              onPress={() => push("/(app)/(tabs)/settings")}
            />
          ) : (
            <View style={styles.mutedBlock}>
              <Feather name="info" size={16} color={colors.textTertiary} />
              <AppText variant="small" color="tertiary" style={{ flex: 1, marginLeft: spacing.sm }}>
                Join a society to subscribe to its calendar.
              </AppText>
            </View>
          )}
        </AppCard>

        <SectionTitle>Other golf tools</SectionTitle>
        <AppCard style={styles.card}>
          <MenuRow
            icon="edit-3"
            iconBg={`${colors.primary}16`}
            title="Free Play"
            subtitle="Casual rounds and historical scorecards"
            colors={colors}
            onPress={() => push("/(app)/free-play")}
          />
        </AppCard>

        {showManCo ? (
          <>
            <SectionTitle>ManCo</SectionTitle>
            <AppCard style={styles.card}>
              <MenuRow
                icon="calendar"
                iconBg={`${colors.primary}16`}
                title="Event administration"
                subtitle="Open Events to manage days, payments, and tee sheets"
                colors={colors}
                onPress={() => push("/(app)/(tabs)/events")}
              />
              {permissions.canAccessFinance ? (
                <>
                  <Divider colors={colors} />
                  <MenuRow
                    icon="book"
                    iconBg={`${colors.primary}18`}
                    title="Society ledger"
                    subtitle="Treasurer ledger and balances"
                    colors={colors}
                    onPress={() => push("/(app)/treasurer")}
                  />
                  <Divider colors={colors} />
                  <MenuRow
                    icon="percent"
                    iconBg={`${colors.success}20`}
                    title="Membership fees"
                    colors={colors}
                    onPress={() => push("/(app)/membership-fees")}
                  />
                  <Divider colors={colors} />
                  <MenuRow
                    icon="bar-chart-2"
                    iconBg={`${colors.info}20`}
                    title="Event finances"
                    colors={colors}
                    onPress={() => push("/(app)/event-finance")}
                  />
                </>
              ) : null}
              {captain ? (
                <>
                  <Divider colors={colors} />
                  <MenuRow
                    icon="shopping-bag"
                    iconBg={`${colors.primary}16`}
                    title="Billing & licences"
                    subtitle="Purchase seats for your society"
                    colors={colors}
                    onPress={() => push("/(app)/billing")}
                  />
                </>
              ) : null}
            </AppCard>
          </>
        ) : null}

        {isAdmin ? (
          <>
            <SectionTitle>Platform administration</SectionTitle>
            <AppCard style={styles.card}>
              <MenuRow
                icon="activity"
                iconBg={`${colors.primary}16`}
                title="Product usage report"
                subtitle="Screen views and product actions (no PII)"
                colors={colors}
                onPress={() => push("/(app)/admin/usage-report" as any)}
              />
              <Divider colors={colors} />
              <MenuRow
                icon="globe"
                iconBg={`${colors.info}20`}
                title="Club domain review"
                subtitle="Approve club website candidates"
                colors={colors}
                onPress={() => push("/(app)/admin/course-domains" as any)}
              />
              <Divider colors={colors} />
              <MenuRow
                icon="database"
                iconBg={`${colors.warning}20`}
                title="Course data administration"
                subtitle="Import review and tee overrides"
                colors={colors}
                onPress={() => push("/(app)/course-data" as any)}
              />
              <Divider colors={colors} />
              <MenuRow
                icon="shopping-bag"
                iconBg={`${colors.primary}16`}
                title="Billing & licences"
                subtitle="Platform access to billing tools"
                colors={colors}
                onPress={() => push("/(app)/billing")}
              />
            </AppCard>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: spacing.md,
  },
  pageTitle: {
    marginBottom: spacing.xs,
  },
  pageSub: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  card: {
    paddingVertical: spacing.xs,
    paddingHorizontal: 0,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 36 + spacing.md + spacing.sm,
  },
  mutedBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
});
