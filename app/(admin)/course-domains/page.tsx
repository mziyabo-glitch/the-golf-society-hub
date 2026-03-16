/**
 * Course Domains Admin
 *
 * Review and approve/reject club domain candidates for the pilot.
 * Shows course, domain, confidence, status; approve/reject actions.
 */

import { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, Linking, ActivityIndicator } from "react-native";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { AppCard } from "@/components/ui/AppCard";
import { PrimaryButton, SecondaryButton } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import { getColors, spacing } from "@/lib/ui/theme";
import { showAlert } from "@/lib/ui/alert";

type CourseDomain = {
  id: string;
  course_id: string;
  domain: string;
  homepage_url: string | null;
  confidence: number | null;
  source: string | null;
  status: string;
};

type CourseWithCandidates = {
  id: string;
  name: string;
  course_name?: string;
  area: string | null;
  candidates: CourseDomain[];
};

const PAGE_SIZE = 20;

export default function CourseDomainsPage() {
  const colors = getColors();
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<CourseWithCandidates[]>([]);
  const [offset, setOffset] = useState(0);
  const [acting, setActing] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data: courseRows, error: e1 } = await supabase
        .from("courses")
        .select("id, course_name, area")
        .order("course_name")
        .range(offset, offset + PAGE_SIZE - 1);

      if (e1) throw e1;
      if (!courseRows || courseRows.length === 0) {
        setCourses([]);
        setLoading(false);
        return;
      }

      const ids = courseRows.map((c) => c.id);
      const { data: domainRows, error: e2 } = await supabase
        .from("course_domains")
        .select("id, course_id, domain, homepage_url, confidence, source, status")
        .in("course_id", ids)
        .order("confidence", { ascending: false });

      if (e2) throw e2;

      const byCourse: Record<string, CourseDomain[]> = {};
      for (const d of domainRows || []) {
        if (!byCourse[d.course_id]) byCourse[d.course_id] = [];
        byCourse[d.course_id].push(d);
      }

      const merged: CourseWithCandidates[] = courseRows.map((c) => ({
        ...c,
        name: c.course_name ?? "",
        candidates: (byCourse[c.id] || []).sort((a, b) => (b.confidence || 0) - (a.confidence || 0)),
      }));

      setCourses(merged);
    } catch (err: unknown) {
      showAlert("Error", (err as Error)?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [offset]);

  const handleApprove = async (domain: CourseDomain, courseId: string) => {
    const key = `${domain.id}-approve`;
    setActing(key);
    try {
      await supabase
        .from("course_domains")
        .update({ status: "approved", updated_at: new Date().toISOString() })
        .eq("id", domain.id);

      await supabase.from("course_domain_reviews").insert({
        course_id: courseId,
        chosen_domain: domain.domain,
        chosen_url: domain.homepage_url,
        decision: "approve",
      });
      showAlert("Approved", `${domain.domain} approved.`);
      load();
    } catch (err: unknown) {
      showAlert("Error", (err as Error)?.message || "Failed to approve");
    } finally {
      setActing(null);
    }
  };

  const handleReject = async (domain: CourseDomain, courseId: string) => {
    const key = `${domain.id}-reject`;
    setActing(key);
    try {
      await supabase
        .from("course_domains")
        .update({ status: "rejected", updated_at: new Date().toISOString() })
        .eq("id", domain.id);

      await supabase.from("course_domain_reviews").insert({
        course_id: courseId,
        chosen_domain: null,
        chosen_url: null,
        decision: "reject",
      });
      showAlert("Rejected", `${domain.domain} rejected.`);
      load();
    } catch (err: unknown) {
      showAlert("Error", (err as Error)?.message || "Failed to reject");
    } finally {
      setActing(null);
    }
  };

  const openUrl = (url: string | null) => {
    const u = url || "";
    if (u.startsWith("http")) Linking.openURL(u);
  };

  const withCandidates = courses.filter((c) => c.candidates.length > 0);

  return (
    <Screen>
      <AppText variant="title" style={styles.title}>
        Course Domains
      </AppText>
      <AppText variant="body" color="secondary" style={styles.subtitle}>
        Review and approve/reject club domain candidates for scorecard crawling.
      </AppText>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : withCandidates.length === 0 ? (
        <AppCard>
          <AppText variant="body" color="secondary">
            No domain candidates to review. Run the discovery script first.
          </AppText>
          <AppText variant="small" color="tertiary" style={{ marginTop: spacing.sm }}>
            npm run build-pilot && npm run discover-domains -- --pilot
          </AppText>
        </AppCard>
      ) : (
        <>
          <View style={styles.pagination}>
            <SecondaryButton
              onPress={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
              disabled={offset === 0}
            >
              Previous
            </SecondaryButton>
            <AppText variant="small" color="secondary">
              {offset + 1}–{offset + PAGE_SIZE}
            </AppText>
            <SecondaryButton onPress={() => setOffset((o) => o + PAGE_SIZE)}>Next</SecondaryButton>
          </View>

          {withCandidates.map((course) => (
            <AppCard key={course.id} style={styles.courseCard}>
              <AppText variant="h2" style={styles.courseName}>
                {course.name}
              </AppText>
              {course.area ? (
                <AppText variant="caption" color="secondary">
                  {course.area}
                </AppText>
              ) : null}

              {course.candidates.map((c) => (
                <View key={c.id} style={[styles.candidateRow, { borderColor: colors.border }]}>
                  <View style={styles.candidateInfo}>
                    <AppText variant="bodyBold">{c.domain}</AppText>
                    <AppText variant="small" color="secondary">
                      Confidence: {c.confidence ?? "—"} • Status: {c.status} • {c.source || "discovery"}
                    </AppText>
                    {c.homepage_url ? (
                      <Pressable onPress={() => openUrl(c.homepage_url)}>
                        <AppText variant="small" style={{ color: colors.primary, marginTop: 2 }}>
                          Open site →
                        </AppText>
                      </Pressable>
                    ) : null}
                  </View>
                  {c.status === "candidate" && (
                    <View style={styles.candidateActions}>
                      <PrimaryButton
                        size="sm"
                        onPress={() => handleApprove(c, course.id)}
                        loading={acting === `${c.id}-approve`}
                        disabled={!!acting}
                      >
                        Approve
                      </PrimaryButton>
                      <SecondaryButton
                        size="sm"
                        onPress={() => handleReject(c, course.id)}
                        loading={acting === `${c.id}-reject`}
                        disabled={!!acting}
                      >
                        Reject
                      </SecondaryButton>
                    </View>
                  )}
                </View>
              ))}
            </AppCard>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.xs },
  subtitle: { marginBottom: spacing.lg },
  centered: { padding: spacing.xl, alignItems: "center" },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  courseCard: { marginBottom: spacing.lg },
  courseName: { marginBottom: spacing.xs },
  candidateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingTop: spacing.base,
    marginTop: spacing.base,
    borderTopWidth: 1,
  },
  candidateInfo: { flex: 1, marginRight: spacing.base },
  candidateActions: { flexDirection: "row", gap: spacing.sm },
});
