/**
 * More hub — secondary society features (members, rivalries), account,
 * finance (treasurer), and permission-gated admin tools.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
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

  const financeEntries: { key: string; row: ReactNode }[] = [];
  if (permissions.canAccessFinance) {
    financeEntries.push(
      {
        key: "ledger",
        row: (
          <MenuRow
            icon="book"
            iconBg={`${colors.primary}18`}
            title="Society ledger"
            subtitle="Treasurer ledger and balances"
            colors={colors}
            onPress={() => push("/(app)/treasurer")}
          />
        ),
      },
      {
        key: "fees",
        row: (
          <MenuRow
            icon="percent"
            iconBg={`${colors.success}20`}
            title="Membership fees"
            colors={colors}
            onPress={() => push("/(app)/membership-fees")}
          />
        ),
      },
      {
        key: "eventfin",
        row: (
          <MenuRow
            icon="bar-chart-2"
            iconBg={`${colors.info}20`}
            title="Event finances"
            colors={colors}
            onPress={() => push("/(app)/event-finance")}
          />
        ),
      },
    );
  }

  const adminToolEntries: { key: string; row: ReactNode }[] = [];
  if (permissions.canGenerateTeeSheet) {
    adminToolEntries.push({
      key: "tee",
      row: (
        <MenuRow
          icon="file-text"
          iconBg={`${colors.warning}20`}
          title="Tee sheet generator"
          subtitle="Grouped sheets with WHS handicaps"
          colors={colors}
          onPress={() => push("/(app)/tee-sheet")}
        />
      ),
    });
  }
  if (captain || secretary || permissions.canManageHandicaps) {
    adminToolEntries.push({
      key: "courseData",
      row: (
        <MenuRow
          icon="database"
          iconBg={`${colors.info}20`}
          title="Course data review"
          subtitle="Import quality, SI checks, and manual overrides"
          colors={colors}
          onPress={() => push("/(app)/course-data")}
        />
      ),
    });
  }
  if (captain) {
    adminToolEntries.push(
      {
        key: "billing",
        row: (
          <MenuRow
            icon="shopping-bag"
            iconBg={`${colors.primary}16`}
            title="Billing & licences"
            subtitle="Purchase seats for your society"
            colors={colors}
            onPress={() => push("/(app)/billing")}
          />
        ),
      },
      {
        key: "domains",
        row: (
          <MenuRow
            icon="globe"
            iconBg={`${colors.info}20`}
            title="Club domain review"
            subtitle="Approve club website candidates"
            colors={colors}
            onPress={() => push("/(admin)/course-domains" as any)}
          />
        ),
      },
    );
  }

  const showFinance = financeEntries.length > 0;
  const showAdminTools = adminToolEntries.length > 0;

  return (
    <Screen scrollable={false} style={{ backgroundColor: colors.backgroundSecondary }}>
      <ScrollView contentContainerStyle={[styles.scrollContent, contentPad]} keyboardShouldPersistTaps="handled">
        <AppText variant="title" style={styles.pageTitle}>
          More
        </AppText>
        <AppText variant="small" color="secondary" style={styles.pageSub}>
          Members, settings, finance, and admin tools
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
          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
          {hasSociety ? (
            <MenuRow
              icon="zap"
              iconBg={`${colors.warning}20`}
              title="Rivalries"
              subtitle="Sinbook challenges and head-to-heads"
              colors={colors}
              onPress={() => push("/(app)/(tabs)/sinbook")}
            />
          ) : (
            <View style={styles.mutedBlock}>
              <Feather name="info" size={16} color={colors.textTertiary} />
              <AppText variant="small" color="tertiary" style={{ flex: 1, marginLeft: spacing.sm }}>
                Join a society to use rivalries.
              </AppText>
            </View>
          )}
        </AppCard>

        <SectionTitle>Account</SectionTitle>
        <AppCard style={styles.card}>
          <MenuRow
            icon="user"
            iconBg={colors.backgroundTertiary}
            title="My profile"
            subtitle="Name, handicap, and preferences"
            colors={colors}
            onPress={() => push("/(app)/my-profile")}
          />
          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
          <MenuRow
            icon="settings"
            iconBg={colors.backgroundTertiary}
            title="Settings"
            subtitle="Society, invites, privacy, and text size"
            colors={colors}
            onPress={() => push("/(app)/(tabs)/settings")}
          />
        </AppCard>

        {showFinance ? (
          <>
            <SectionTitle>Finance</SectionTitle>
            <AppCard style={styles.card}>
              {financeEntries.map((e, i) => (
                <View key={e.key}>
                  {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.borderLight }]} /> : null}
                  {e.row}
                </View>
              ))}
            </AppCard>
          </>
        ) : null}

        {showAdminTools ? (
          <>
            <SectionTitle>Admin tools</SectionTitle>
            <AppCard style={styles.card}>
              {adminToolEntries.map((e, i) => (
                <View key={e.key}>
                  {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.borderLight }]} /> : null}
                  {e.row}
                </View>
              ))}
            </AppCard>
          </>
        ) : null}

        {isAdmin ? (
          <>
            <SectionTitle>Platform</SectionTitle>
            <AppCard style={styles.card}>
              <MenuRow
                icon="shield"
                iconBg={`${colors.error}18`}
                title="Platform administration"
                subtitle="Switch societies, support tools — opens Settings"
                colors={colors}
                onPress={() => push("/(app)/(tabs)/settings")}
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
    letterSpacing: -0.3,
  },
  pageSub: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    fontSize: 11,
  },
  card: {
    marginBottom: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 48,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 48,
  },
  mutedBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
});
