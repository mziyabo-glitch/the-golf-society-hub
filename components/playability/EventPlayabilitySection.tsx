/**
 * Full playability + course actions + status log for an event context.
 * Same forecast + engine path as Weather tab (usePlayabilityBundle).
 */

import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { EventDoc } from "@/lib/db_supabase/eventRepo";
import { listEventCourseStatusUpdates, type EventCourseStatusRow } from "@/lib/db_supabase/eventCourseStatusRepo";
import { usePlayabilityBundle } from "@/lib/playability/usePlayabilityBundle";
import { PlayabilityCard } from "./PlayabilityCard";
import { CourseActionRow } from "./CourseActionRow";
import { CourseStatusStrip } from "./CourseStatusStrip";
import { CourseStatusLogModal } from "./CourseStatusLogModal";
import { CourseStatusLatestBanner } from "./CourseStatusLatestBanner";
import { HourlyForecastStrip } from "./HourlyForecastStrip";
import { DailyForecastBlock } from "./DailyForecastBlock";
import { FiveDayPlayabilityPlanCard } from "./FiveDayPlayabilityPlanCard";

type Props = {
  event: EventDoc;
  societyId: string | null | undefined;
  memberId: string | null | undefined;
  enabled: boolean;
  preferredTeeTimeLocal?: string | null;
};

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function EventPlayabilitySection({
  event,
  societyId,
  memberId,
  enabled,
  preferredTeeTimeLocal = null,
}: Props) {
  const courseName = (event.courseName || "Golf course").trim();
  const courseId = (event.courseId || event.course_id || null) as string | null | undefined;
  const apiCourseId =
    typeof (event as any).api_course_id === "number"
      ? (event as any).api_course_id
      : typeof (event as any).api_course_id === "string" && /^\d+$/.test((event as any).api_course_id)
        ? Number((event as any).api_course_id)
        : null;

  const targetDateYmd = useMemo(() => {
    const d = event.date?.trim();
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    return todayYmd();
  }, [event.date]);

  const bundle = usePlayabilityBundle(
    enabled && !!societyId,
    targetDateYmd,
    courseId,
    apiCourseId,
    courseName,
    { preferredTeeTimeLocal },
  );

  const [statusRows, setStatusRows] = useState<EventCourseStatusRow[]>([]);
  const [statusModal, setStatusModal] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!event.id || !enabled) return;
    const rows = await listEventCourseStatusUpdates(event.id);
    setStatusRows(rows);
  }, [event.id, enabled]);

  useFocusEffect(
    useCallback(() => {
      void loadStatus();
    }, [loadStatus]),
  );

  if (!enabled || !societyId) return null;

  const contact = bundle.contact ?? {
    courseName,
    lat: null,
    lng: null,
    phone: null,
    websiteUrl: null,
  };

  const coordsHint = bundle.coords
    ? `${bundle.coords.label} · ${bundle.coords.source === "course_db" ? "Your course" : bundle.coords.source === "golf_api" ? "Directory" : "Located"}`
    : null;

  const earlierStatus = statusRows.length > 1 ? statusRows.slice(1) : [];

  return (
    <View>
      <CourseStatusLatestBanner latest={statusRows[0]} onOpenLog={() => setStatusModal(true)} />

      <PlayabilityCard
        loading={bundle.loading}
        error={bundle.error}
        insight={bundle.insight}
        coordsHint={coordsHint}
        onRefresh={bundle.refetch}
        linkedPlannerNote="Verdict: your event day. Planner: five full local days in four-hour blocks."
      />

      {!bundle.loading && !bundle.error && bundle.insight ? (
        <>
          <HourlyForecastStrip slots={bundle.insight.playTimeline} hours={bundle.hourlyStrip} />
          <DailyForecastBlock days={bundle.dailyOutlook} />
        </>
      ) : null}

      <FiveDayPlayabilityPlanCard
        loading={bundle.loading}
        forecast={bundle.forecast}
        startDateYmd={todayYmd()}
      />

      <CourseActionRow
        contact={contact}
        insight={bundle.insight}
        eventDate={event.date ?? null}
        onAfterCall={() => setStatusModal(true)}
      />

      {statusRows.length > 0 ? (
        <CourseStatusStrip
          sectionTitle="Earlier updates"
          rows={earlierStatus}
          onLogPress={() => setStatusModal(true)}
          emptyHint={statusRows.length === 1 ? "No earlier reports yet." : undefined}
        />
      ) : null}

      {memberId ? (
        <CourseStatusLogModal
          visible={statusModal}
          onClose={() => setStatusModal(false)}
          eventId={event.id}
          societyId={societyId}
          memberId={memberId}
          onSubmitted={loadStatus}
        />
      ) : null}
    </View>
  );
}
