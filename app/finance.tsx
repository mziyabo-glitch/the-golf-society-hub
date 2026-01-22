// app/finance-events.tsx
import { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";

import { useBootstrap } from "@/lib/useBootstrap";
import { getPermissionsForMember } from "@/lib/rbac";

import { listEvents } from "@/lib/db/eventRepo";
import { getSociety } from "@/lib/db/societyRepo";
import { getMembersBySocietyId } from "@/lib/db/memberRepo";

type EventLite = {
  id: string;
  title?: string;
  date?: any;
  eventFee?: number;
};

export default function FinanceEventsScreen() {
  const { societyId, member } = useBootstrap();
  const perms = useMemo(() => getPermissionsForMember(member), [member]);

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventLite[]>([]);
  const [annualFee, setAnnualFee] = useState<number>(0);

  const [membersCount, setMembersCount] = useState<number>(0);
  const [membersPaidCount, setMembersPaidCount] = useState<number>(0);
  const [membershipReceived, setMembershipReceived] = useState<number>(0);

  useEffect(() => {
    if (!societyId) return;
    if (!perms.canAccessFinance) return;

    const load = async () => {
      setLoading(true);
      try {
        const [society, evts, members] = await Promise.all([
          getSociety(societyId),
          listEvents(societyId),
          getMembersBySocietyId(societyId),
        ]);

        setAnnualFee(Number(society?.annualFee ?? 0));

        const list = (evts ?? []).map((e: any) => ({
          id: e.id,
          title: e.title ?? e.name ?? "Event",
          date: e.date ?? e.startDate ?? e.createdAt,
          eventFee: Number(e.eventFee ?? 0),
        }));

        // sort newest first (best effort)
        list.sort((a, b) => {
          const ad =
            typeof a.date?.toDate === "function"
              ? a.date.toDate().getTime()
              : a.date?.seconds
              ? a.date.seconds * 1000
              : a.date
              ? new Date(a.date).getTime()
              : 0;
          const bd =
            typeof b.date?.toDate === "function"
              ? b.date.toDate().getTime()
              : b.date?.seconds
              ? b.date.seconds * 1000
              : b.date
              ? new Date(b.date).getTime()
              : 0;
          return bd - ad;
        });

        setEvents(list);

        // membership rollup (simple MVP)
        const mems = members ?? [];
        setMembersCount(mems.length);

        const paid = mems.filter((m: any) => Boolean(m.paid));
        setMembersPaidCount(paid.length);

        // if amountPaid exists, sum it; otherwise use annual fee for "paid"
        const received = paid.reduce((sum: number, m: any) => {
          const amt =
            m.amountPaid != null && !isNaN(Number(m.amountPaid))
              ? Number(m.amountPaid)
              : Number(society?.annualFee ?? 0);
          return sum + amt;
        }, 0);

        setMembershipReceived(received);
      } catch (e: any) {
        console.error(e);
        Alert.alert("Finance", e?.message ?? "Failed to load finance data.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [societyId, perms.canAccessFinance]);

  const seasonNet = useMemo(() => {
    // Event P&L per-event is calculated in the event manager screen.
    // Here we only show Membership Received as "baseline" net.
    // (You can extend this later to compute full season net by summing
    // eventFeesReceived - expensesTotal per event.)
    return membershipReceived;
  }, [membershipReceived]);

  if (!perms.canAccessFinance) {
    return (
      <Screen>
        <SectionHeader title="Event P&L" />
        <AppCard>
          <AppText style={{ marginBottom: 12 }}>
            You don’t have access to Finance. (Captain/Treasurer only)
          </AppText>
          <SecondaryButton label="Back" onPress={() => router.back()} />
        </AppCard>
      </Screen>
    );
  }

  return (
    <Screen>
      <SectionHeader
        title="Event P&L"
        subtitle="Manage event fees, payments and expenses"
      />

      <AppCard style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <AppText style={styles.kpiLabel}>Annual Fee</AppText>
            <AppText style={styles.kpiValue}>£{annualFee.toFixed(0)}</AppText>
          </View>

          <View style={styles.summaryItem}>
            <AppText style={styles.kpiLabel}>Members Paid</AppText>
            <AppText style={styles.kpiValue}>
              {membersPaidCount}/{membersCount}
            </AppText>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <AppText style={styles.kpiLabel}>Membership Received</AppText>
            <AppText style={styles.kpiValue}>
              £{membershipReceived.toFixed(0)}
            </AppText>
          </View>

          <View style={styles.summaryItem}>
            <AppText style={styles.kpiLabel}>Season Net (MVP)</AppText>
            <AppText style={styles.kpiValue}>£{seasonNet.toFixed(0)}</AppText>
          </View>
        </View>

        <AppText style={styles.note}>
          MVP: Season Net currently reflects Membership Received only. Per-event
          profit/loss is shown inside each event.
        </AppText>
      </AppCard>

      <AppCard>
        <View style={styles.headerRow}>
          <AppText style={styles.h2}>Events</AppText>
          {loading ? (
            <AppText>Loading…</AppText>
          ) : (
            <AppText style={styles.muted}>{events.length}</AppText>
          )}
        </View>

        <ScrollView style={{ maxHeight: 520 }}>
          {events.map((e) => (
            <View key={e.id} style={styles.eventRow}>
              <View style={{ flex: 1 }}>
                <AppText style={styles.eventTitle}>{e.title}</AppText>
                <AppText style={styles.muted}>
                  Event Fee: £{Number(e.eventFee ?? 0).toFixed(0)}
                </AppText>
              </View>

              <PrimaryButton
                label="Open"
                onPress={() => router.push(`/finance-events/${e.id}`)}
                icon={<Feather name="chevron-right" size={16} />}
              />
            </View>
          ))}

          {!loading && events.length === 0 ? (
            <AppText style={styles.muted}>
              No events found. Create an event first.
            </AppText>
          ) : null}
        </ScrollView>
      </AppCard>

      <SecondaryButton label="Back" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
  },
  summaryItem: {
    flex: 1,
  },
  kpiLabel: {
    opacity: 0.7,
    marginBottom: 2,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  note: {
    marginTop: 8,
    opacity: 0.7,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  h2: {
    fontSize: 18,
    fontWeight: "700",
  },
  muted: {
    opacity: 0.7,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
});
