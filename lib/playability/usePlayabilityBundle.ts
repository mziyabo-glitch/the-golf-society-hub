/**
 * Single orchestration: resolve course context → fetch forecast → playability.
 * Use for Weather tab (next event / manual course) and event detail — same verdict path.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { computePlayability } from "./playabilityEngine";
import { fetchNormalizedForecast, fetchSunriseSunsetForYmd } from "./weatherService";
import { resolvePlayabilityContext } from "./resolvePlayabilityContext";
import { selectDailyOutlookFrom, selectHourlyStripForUi } from "./forecastSelectors";
import { parsePreferredTeeMinutes } from "./golfDaylightWindow";
import type { DailyForecastPoint, HourlyForecastPoint, NormalizedForecast, PlayabilityInsight } from "./types";
import type { CourseContactBundle } from "./courseContactLayer";
import type { ResolvedCourseCoords } from "./types";

export type PlayabilityBundleOptions = {
  /** Local clock time e.g. "09:10" — biases best window toward tee time, still daylight-only */
  preferredTeeTimeLocal?: string | null;
};

export type PlayabilityBundleState = {
  loading: boolean;
  error: string | null;
  insight: PlayabilityInsight | null;
  coords: ResolvedCourseCoords | null;
  contact: CourseContactBundle | null;
  forecast: NormalizedForecast | null;
  /** Target-day hours in typical golf window for strip UI */
  hourlyStrip: HourlyForecastPoint[];
  /** Multi-day outlook from target date */
  dailyOutlook: DailyForecastPoint[];
  refetch: () => void;
};

export function usePlayabilityBundle(
  enabled: boolean,
  targetDateYmd: string,
  courseId: string | null | undefined,
  apiCourseId: number | null | undefined,
  courseNameFallback: string,
  bundleOptions?: PlayabilityBundleOptions,
): PlayabilityBundleState {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insight, setInsight] = useState<PlayabilityInsight | null>(null);
  const [coords, setCoords] = useState<ResolvedCourseCoords | null>(null);
  const [contact, setContact] = useState<CourseContactBundle | null>(null);
  const [forecast, setForecast] = useState<NormalizedForecast | null>(null);
  const [tick, setTick] = useState(0);

  const preferredTee = bundleOptions?.preferredTeeTimeLocal ?? null;

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setInsight(null);
      setCoords(null);
      setContact(null);
      setForecast(null);
      setError(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const ctx = await resolvePlayabilityContext({
          courseId: courseId ?? null,
          apiCourseId: apiCourseId ?? null,
          courseNameFallback,
        });
        if (cancelled) return;
        setCoords(ctx.coords);
        setContact(ctx.contact);

        if (!ctx.coords) {
          setInsight(null);
          setForecast(null);
          setError(null);
          setLoading(false);
          return;
        }

        const fc = await fetchNormalizedForecast(ctx.coords.lat, ctx.coords.lng);
        if (cancelled) return;
        setForecast(fc);

        const dayRow = fc.daily.find((d) => d.dateYmd === targetDateYmd);
        let sunrise = dayRow?.sunrise ?? null;
        let sunset = dayRow?.sunset ?? null;
        if ((!sunrise || !sunset) && ctx.coords) {
          const sun = await fetchSunriseSunsetForYmd(ctx.coords.lat, ctx.coords.lng, targetDateYmd);
          if (cancelled) return;
          if (sun) {
            sunrise = sun.sunrise;
            sunset = sun.sunset;
          }
        }

        const preferredMinutes = parsePreferredTeeMinutes(preferredTee);

        const computed = computePlayability(fc.hourly, targetDateYmd, {
          sunriseIso: sunrise,
          sunsetIso: sunset,
          preferredTeeMinutesLocal: preferredMinutes,
        });
        if (!cancelled) setInsight(computed);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Could not load forecast");
          setInsight(null);
          setForecast(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, targetDateYmd, courseId, apiCourseId, courseNameFallback, preferredTee, tick]);

  const hourlyStrip = useMemo(() => {
    if (!forecast?.hourly.length) return [];
    return selectHourlyStripForUi(forecast.hourly, targetDateYmd);
  }, [forecast, targetDateYmd]);

  const dailyOutlook = useMemo(() => {
    if (!forecast?.daily.length) return [];
    return selectDailyOutlookFrom(forecast.daily, targetDateYmd, 5);
  }, [forecast, targetDateYmd]);

  return {
    loading,
    error,
    insight,
    coords,
    contact,
    forecast,
    hourlyStrip,
    dailyOutlook,
    refetch,
  };
}
