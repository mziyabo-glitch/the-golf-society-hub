import type { HourlyForecastPoint, PlayTimelineSlot } from "@/lib/playability/types";
import { PlayTimelineBar } from "./PlayTimelineBar";

type Props = {
  /** From `insight.playTimeline` (8am–2pm-style slots). */
  slots?: PlayTimelineSlot[];
  hours: HourlyForecastPoint[];
  title?: string;
};

/** Thin wrapper — forwards to PlayTimelineBar; `title` is ignored (section title fixed in bar). */
export function HourlyForecastStrip({ slots = [], hours }: Props) {
  return <PlayTimelineBar slots={slots} fallbackHours={hours} />;
}
