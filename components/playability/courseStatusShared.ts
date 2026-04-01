import type { CourseStatusValue } from "@/lib/db_supabase/eventCourseStatusRepo";

export const COURSE_STATUS_LABEL: Record<CourseStatusValue, string> = {
  open: "Open",
  restricted: "Restricted",
  temp_greens: "Temp greens",
  closed: "Closed",
};

/** Compact line for strips / banner */
export function formatCourseStatusTimestampShort(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Full line for timeline / modal */
export function formatCourseStatusTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
