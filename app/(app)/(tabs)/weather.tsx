/**
 * FairwayWeather detail screen — premium in-app weather flow:
 * event/default/recent course switching, search, and embedded browser launch.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";

import { Screen } from "@/components/ui/Screen";
import { AppText } from "@/components/ui/AppText";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { LicenceRequiredModal } from "@/components/LicenceRequiredModal";
import { EventPlayabilitySection } from "@/components/playability/EventPlayabilitySection";
import { CourseSelector } from "@/components/playability/CourseSelector";
import {
  CourseSearchResults,
  type CourseSearchListItem,
} from "@/components/playability/CourseSearchResults";
import { SelectedCourseHeader } from "@/components/playability/SelectedCourseHeader";
import { PlayabilityCard } from "@/components/playability/PlayabilityCard";
import { HourlyForecastStrip } from "@/components/playability/HourlyForecastStrip";
import { DailyForecastBlock } from "@/components/playability/DailyForecastBlock";
import { CourseActionRow } from "@/components/playability/CourseActionRow";
import { FiveDayPlayabilityPlanCard } from "@/components/playability/FiveDayPlayabilityPlanCard";
import { useBootstrap } from "@/lib/useBootstrap";
import { usePaidAccess } from "@/lib/access/usePaidAccess";
import { isCaptain } from "@/lib/rbac";
import { getEventsForSociety, type EventDoc } from "@/lib/db_supabase/eventRepo";
import { searchCourses as searchCoursesDb } from "@/lib/db_supabase/courseRepo";
import { searchCourses as searchCoursesApi } from "@/lib/golfApi";
import { getColors, spacing, radius, premiumTokens } from "@/lib/ui/theme";
import { usePlayabilityBundle } from "@/lib/playability/usePlayabilityBundle";
import {
  loadDefaultWeatherCourse,
  loadRecentWeatherCourses,
  rememberWeatherCourse,
  setDefaultWeatherCourse,
  type RecentWeatherCourse,
} from "@/lib/playability/weatherRecentCourses";
import { planStartForFiveDayWindow } from "@/lib/playability/weatherPlanAnchor";
import { HeaderSettingsPill } from "@/components/navigation/HeaderSettingsPill";
import { blurWebActiveElement } from "@/lib/ui/focus";

type WeatherMode = "next_event" | "choose_course";

type ManualPick =
  | { source: "db"; courseId: string; name: string; location: string | null }
  | { source: "api"; apiCourseId: number; name: string; location: string | null };

function formatEventDate(dateStr?: string): string {
  if (!dateStr) return "TBD";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  } catch {
    return "TBD";
  }
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function firstRouteParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  const s = Array.isArray(v) ? v[0] : v;
  const t = typeof s === "string" ? s.trim() : "";
  return t.length ? t : undefined;
}

function buildFairwayWeatherUrl(courseName: string): string {
  const q = courseName.trim();
  if (!q) return "https://www.fairwayweather.com";
  return `https://www.fairwayweather.com/?q=${encodeURIComponent(q)}`;
}

function ModeChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  const colors = getColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        sheet.modeChip,
        {
          backgroundColor: active ? colors.primary : colors.surfaceElevated,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
    >
      <AppText variant="captionBold" style={{ color: active ? "#fff" : colors.textSecondary }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export default function WeatherScreen() {
  const colors = getColors();
  const router = useRouter();
  const weatherLinkParams = useLocalSearchParams<{
    courseId?: string;
    apiCourseId?: string;
    eventDate?: string;
    courseName?: string;
  }>();
  const appliedWeatherLinkKey = useRef<string | null>(null);
  const [forecastTargetYmd, setForecastTargetYmd] = useState<string | null>(null);
  const tabBarHeight = useBottomTabBarHeight();
  const tabContentStyle = { paddingTop: 16, paddingBottom: tabBarHeight + 24 };

  const { society, societyId, member, loading: bootstrapLoading } = useBootstrap();
  const { needsLicence, modalVisible, setModalVisible, societyId: guardSocietyId } = usePaidAccess();

  const memberHasSeat = (member as any)?.has_seat === true;
  const memberIsCaptain = isCaptain(member as any);
  const canLoadSocietyWeather = !!societyId && !!member && (memberHasSeat || memberIsCaptain);

  const [events, setEvents] = useState<EventDoc[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [mode, setMode] = useState<WeatherMode>("next_event");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [dbHits, setDbHits] = useState<Awaited<ReturnType<typeof searchCoursesDb>>["data"]>([]);
  const [apiHits, setApiHits] = useState<Awaited<ReturnType<typeof searchCoursesApi>>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [apiSearched, setApiSearched] = useState(false);
  const [apiLoading, setApiLoading] = useState(false);
  const [manualPick, setManualPick] = useState<ManualPick | null>(null);
  const [recent, setRecent] = useState<RecentWeatherCourse[]>([]);
  const [defaultCourse, setDefaultCourse] = useState<RecentWeatherCourse | null>(null);

  const loadEvents = useCallback(async () => {
    if (!canLoadSocietyWeather || !societyId) {
      setEvents([]);
      setEventsLoading(false);
      return;
    }
    setEventsLoading(true);
    try {
      const data = await getEventsForSociety(societyId);
      setEvents(data);
    } catch (e) {
      console.error("[weather] Failed to load events:", e);
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, [canLoadSocietyWeather, societyId]);

  useFocusEffect(
    useCallback(() => {
      void loadEvents();
    }, [loadEvents]),
  );

  useFocusEffect(
    useCallback(() => {
      const courseId = firstRouteParam(weatherLinkParams.courseId);
      const apiCourseId = firstRouteParam(weatherLinkParams.apiCourseId);
      const eventDate = firstRouteParam(weatherLinkParams.eventDate);
      const courseName = firstRouteParam(weatherLinkParams.courseName);
      if (!courseId && !apiCourseId) return;
      const key = `${courseId ?? ""}|${apiCourseId ?? ""}|${eventDate ?? ""}|${courseName ?? ""}`;
      if (appliedWeatherLinkKey.current === key) return;
      appliedWeatherLinkKey.current = key;
      setMode("choose_course");
      const displayName = (courseName || "Golf course").trim();
      if (courseId) {
        setManualPick({
          source: "db",
          courseId,
          name: displayName,
          location: null,
        });
        void rememberWeatherCourse({ courseDbId: courseId, apiCourseId: null, name: displayName });
      } else if (apiCourseId && /^\d+$/.test(apiCourseId)) {
        const n = Number(apiCourseId);
        if (Number.isFinite(n)) {
          setManualPick({
            source: "api",
            apiCourseId: n,
            name: displayName,
            location: null,
          });
          void rememberWeatherCourse({ courseDbId: null, apiCourseId: n, name: displayName });
        }
      }
      if (eventDate && /^\d{4}-\d{2}-\d{2}$/.test(eventDate)) setForecastTargetYmd(eventDate);
      else setForecastTargetYmd(null);
    }, [
      weatherLinkParams.courseId,
      weatherLinkParams.apiCourseId,
      weatherLinkParams.eventDate,
      weatherLinkParams.courseName,
    ]),
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 320);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    void loadRecentWeatherCourses().then(setRecent);
    void loadDefaultWeatherCourse().then(setDefaultCourse);
  }, []);

  const todayLocalKey = useMemo(() => todayYmd(), []);

  const nextEvent = useMemo(() => {
    const upcoming = events.filter(
      (e) =>
        !e.isCompleted &&
        e.date &&
        /^\d{4}-\d{2}-\d{2}$/.test(e.date.trim()) &&
        e.date.trim() >= todayLocalKey,
    );
    upcoming.sort((a, b) => {
      const da = a.date!.trim();
      const db = b.date!.trim();
      if (da !== db) return da.localeCompare(db);
      return (a.name || "").localeCompare(b.name || "");
    });
    return upcoming[0] ?? null;
  }, [events, todayLocalKey]);

  useEffect(() => {
    if (mode !== "choose_course") return;
    const q = debouncedQuery;
    if (q.length < 2) {
      setDbHits([]);
      setApiHits([]);
      setApiSearched(false);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setSearchLoading(true);
      setApiSearched(false);
      setApiHits([]);
      try {
        const { data } = await searchCoursesDb(q, 24);
        if (!cancelled) setDbHits(data);
      } catch {
        if (!cancelled) setDbHits([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, mode]);

  const runApiSearch = useCallback(async () => {
    const q = debouncedQuery;
    if (q.length < 2) return;
    setApiLoading(true);
    setApiSearched(true);
    try {
      const hits = await searchCoursesApi(q);
      setApiHits(hits);
    } catch (e: any) {
      console.warn("[weather] API course search:", e?.message);
      setApiHits([]);
    } finally {
      setApiLoading(false);
    }
  }, [debouncedQuery]);

  const setManualPickAndRemember = useCallback(
    (next: ManualPick) => {
      setManualPick(next);
      const recentEntry: RecentWeatherCourse =
        next.source === "db"
          ? { courseDbId: next.courseId, apiCourseId: null, name: next.name }
          : { courseDbId: null, apiCourseId: next.apiCourseId, name: next.name };
      void rememberWeatherCourse(recentEntry).then(() => loadRecentWeatherCourses().then(setRecent));
    },
    [],
  );

  const pickDefaultCourse = useCallback(
    (entry: RecentWeatherCourse | null) => {
      if (!entry) return;
      if (entry.courseDbId) {
        setManualPick({
          source: "db",
          courseId: entry.courseDbId,
          name: entry.name,
          location: null,
        });
      } else if (entry.apiCourseId != null) {
        setManualPick({
          source: "api",
          apiCourseId: entry.apiCourseId,
          name: entry.name,
          location: null,
        });
      }
      setMode("choose_course");
    },
    [],
  );

  const listItems = useMemo((): CourseSearchListItem[] => {
    const dbItems: CourseSearchListItem[] = dbHits.map((h) => ({
      key: `db:${h.id}`,
      title: h.name,
      subtitle: h.location || null,
      sourceLabel: "Your society courses",
    }));
    const apiItems: CourseSearchListItem[] = apiHits.map((h) => ({
      key: `api:${h.id}`,
      title: h.name,
      subtitle: h.location || h.club_name || null,
      sourceLabel: "Golf course directory",
    }));
    return [...dbItems, ...apiItems];
  }, [dbHits, apiHits]);

  const onSelectSearchItem = useCallback(
    (item: CourseSearchListItem) => {
      if (item.key.startsWith("db:")) {
        const id = item.key.slice(3);
        setManualPickAndRemember({
          source: "db",
          courseId: id,
          name: item.title,
          location: item.subtitle ?? null,
        });
      } else if (item.key.startsWith("api:")) {
        const id = Number(item.key.slice(4));
        if (!Number.isFinite(id)) return;
        setManualPickAndRemember({
          source: "api",
          apiCourseId: id,
          name: item.title,
          location: item.subtitle ?? null,
        });
      }
      setSearchQuery("");
    },
    [setManualPickAndRemember],
  );

  const onSelectRecent = useCallback((r: RecentWeatherCourse) => {
    if (r.courseDbId) {
      setManualPickAndRemember({
        source: "db",
        courseId: r.courseDbId,
        name: r.name,
        location: null,
      });
    } else if (r.apiCourseId != null) {
      setManualPickAndRemember({
        source: "api",
        apiCourseId: r.apiCourseId,
        name: r.name,
        location: null,
      });
    }
  }, [setManualPickAndRemember]);

  const manualCourseId = manualPick?.source === "db" ? manualPick.courseId : null;
  const manualApiId = manualPick?.source === "api" ? manualPick.apiCourseId : null;
  const manualName = manualPick?.name ?? "Golf course";
  const selectedCourseName = useMemo(() => {
    if (mode === "choose_course" && manualPick?.name) return manualPick.name;
    if (nextEvent?.courseName?.trim()) return nextEvent.courseName.trim();
    return "Golf course";
  }, [mode, manualPick?.name, nextEvent?.courseName]);

  const bundleTargetYmd = useMemo(() => {
    if (forecastTargetYmd && /^\d{4}-\d{2}-\d{2}$/.test(forecastTargetYmd)) return forecastTargetYmd;
    return todayYmd();
  }, [forecastTargetYmd]);

  const fiveDayPlanStartYmd = useMemo(
    () => planStartForFiveDayWindow(todayYmd(), bundleTargetYmd),
    [bundleTargetYmd],
  );

  const manualBundle = usePlayabilityBundle(
    mode === "choose_course" && !!manualPick,
    bundleTargetYmd,
    manualCourseId,
    manualApiId,
    manualName,
  );

  const openSettings = useCallback(() => {
    try {
      blurWebActiveElement();
    } catch {
      /* noop */
    }
    router.push("/(app)/(tabs)/settings");
  }, [router]);

  const openFairwayWeatherBrowser = useCallback(async () => {
    const url = buildFairwayWeatherUrl(selectedCourseName);
    await WebBrowser.openBrowserAsync(url, {
      controlsColor: colors.primary,
      toolbarColor: colors.background,
      showTitle: true,
    });
  }, [colors.background, colors.primary, selectedCourseName]);

  const makeManualPickDefault = useCallback(async () => {
    if (!manualPick) return;
    const entry: RecentWeatherCourse =
      manualPick.source === "db"
        ? { courseDbId: manualPick.courseId, apiCourseId: null, name: manualPick.name }
        : { courseDbId: null, apiCourseId: manualPick.apiCourseId, name: manualPick.name };
    await setDefaultWeatherCourse(entry);
    setDefaultCourse(entry);
  }, [manualPick]);

  if (bootstrapLoading && !societyId) {
    return (
      <Screen scrollable={false} style={{ backgroundColor: colors.backgroundSecondary }}>
        <LoadingState message="Loading..." />
      </Screen>
    );
  }

  if (!societyId || !society) {
    return (
      <Screen style={{ backgroundColor: colors.backgroundSecondary }} contentStyle={tabContentStyle}>
        <View style={sheet.titleRow}>
          <AppText variant="h2" style={{ flex: 1, marginRight: spacing.sm }}>
            FairwayWeather
          </AppText>
          <HeaderSettingsPill onPress={openSettings} />
        </View>
        <AppText variant="body" color="secondary">
          Join or select a society to use the in-app FairwayWeather experience for your schedule and favourite courses.
        </AppText>
      </Screen>
    );
  }

  if (needsLicence) {
    return (
      <Screen style={{ backgroundColor: colors.backgroundSecondary }} contentStyle={tabContentStyle}>
        <View style={sheet.titleRow}>
          <AppText variant="h2" style={{ flex: 1, marginRight: spacing.sm }}>
            FairwayWeather
          </AppText>
          <HeaderSettingsPill onPress={openSettings} />
        </View>
        <EmptyState
          icon={<Feather name="cloud" size={28} color={colors.primary} />}
          title="Premium weather"
          message="Get a society licence to unlock live playability, full FairwayWeather detail, and course tracking."
          action={{
            label: "How to get access",
            onPress: () => setModalVisible(true),
          }}
        />
        <LicenceRequiredModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          societyId={guardSocietyId}
        />
      </Screen>
    );
  }

  return (
    <Screen style={{ backgroundColor: colors.backgroundSecondary }} contentStyle={tabContentStyle}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={{ marginBottom: spacing.md }}>
          <View style={[sheet.titleRow, { marginBottom: spacing.xs }]}>
            <AppText variant="h2" style={{ flex: 1, marginRight: spacing.sm }}>
              FairwayWeather
            </AppText>
            <HeaderSettingsPill onPress={openSettings} />
          </View>
          <AppText variant="small" color="secondary">
            Powered by FairwayWeather. Compare event/default courses, then open the full forecast in an embedded browser.
          </AppText>
        </View>

        <View style={sheet.modeRow}>
          <ModeChip active={mode === "next_event"} label="Event course" onPress={() => setMode("next_event")} />
          <ModeChip active={mode === "choose_course"} label="Search courses" onPress={() => setMode("choose_course")} />
        </View>

        <View style={[sheet.browserCtaCard, { borderColor: colors.borderLight, backgroundColor: colors.surfaceElevated }]}>
          <View style={sheet.browserCtaHead}>
            <Feather name="globe" size={15} color={colors.primary} />
            <AppText variant="captionBold" color="primary">
              View full forecast
            </AppText>
          </View>
          <AppText variant="small" color="secondary" numberOfLines={2} style={{ flex: 1 }}>
            Open FairwayWeather for {selectedCourseName}
          </AppText>
          <Pressable
            onPress={() => void openFairwayWeatherBrowser()}
            style={({ pressed }) => [sheet.browserCtaBtn, { backgroundColor: `${colors.primary}12`, opacity: pressed ? 0.85 : 1 }]}
          >
            <AppText variant="captionBold" color="primary">
              Open
            </AppText>
            <Feather name="external-link" size={14} color={colors.primary} />
          </Pressable>
        </View>

        {mode === "next_event" ? (
          <>
            {eventsLoading ? (
              <LoadingState message="Loading schedule…" />
            ) : nextEvent && societyId && member?.id ? (
              <>
                <View
                  style={[
                    sheet.eventCard,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: premiumTokens.cardBorder,
                    },
                    premiumTokens.cardShadow,
                  ]}
                >
                  <AppText variant="captionBold" color="tertiary" style={sheet.eventEyebrow}>
                    Next up
                  </AppText>
                  <AppText variant="h2" numberOfLines={2} style={sheet.eventTitle}>
                    {nextEvent.name}
                  </AppText>
                  <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
                    {formatEventDate(nextEvent.date)}
                    {nextEvent.courseName ? ` · ${nextEvent.courseName}` : ""}
                  </AppText>
                </View>
                <EventPlayabilitySection
                  event={nextEvent}
                  societyId={societyId}
                  memberId={member.id}
                  enabled
                />
              </>
            ) : (
              <EmptyState
                icon={<Feather name="calendar" size={28} color={colors.primary} />}
                title="No upcoming event"
                message="Add a dated event with a course to see playability, hourly trends, and member course status here."
              />
            )}
          </>
        ) : (
          <>
            {!manualPick ? (
              <>
                <View style={{ marginBottom: spacing.md }}>
                  <AppText variant="captionBold" color="secondary" style={sheet.sectionEyebrow}>
                    Quick picks
                  </AppText>
                  {nextEvent?.courseName?.trim() ? (
                    <Pressable
                      onPress={() => {
                        setMode("next_event");
                        setForecastTargetYmd(nextEvent?.date ?? null);
                      }}
                      style={({ pressed }) => [
                        sheet.recentRow,
                        {
                          backgroundColor: colors.surfaceElevated,
                          borderColor: colors.border,
                          opacity: pressed ? 0.9 : 1,
                        },
                      ]}
                    >
                      <Feather name="calendar" size={16} color={colors.textTertiary} />
                      <AppText variant="body" style={{ flex: 1, marginLeft: spacing.sm }} numberOfLines={2}>
                        Event course · {nextEvent.courseName}
                      </AppText>
                      <Feather name="chevron-right" size={18} color={colors.textTertiary} />
                    </Pressable>
                  ) : null}
                  {defaultCourse ? (
                    <Pressable
                      onPress={() => pickDefaultCourse(defaultCourse)}
                      style={({ pressed }) => [
                        sheet.recentRow,
                        {
                          backgroundColor: colors.surfaceElevated,
                          borderColor: colors.border,
                          opacity: pressed ? 0.9 : 1,
                        },
                      ]}
                    >
                      <Feather name="star" size={16} color={colors.textTertiary} />
                      <AppText variant="body" style={{ flex: 1, marginLeft: spacing.sm }} numberOfLines={2}>
                        Default course · {defaultCourse.name}
                      </AppText>
                      <Feather name="chevron-right" size={18} color={colors.textTertiary} />
                    </Pressable>
                  ) : null}
                </View>

                <CourseSelector value={searchQuery} onChangeText={setSearchQuery} />

                {recent.length > 0 && debouncedQuery.length < 2 ? (
                  <View style={{ marginBottom: spacing.md }}>
                    <AppText variant="captionBold" color="secondary" style={sheet.sectionEyebrow}>
                      Recent
                    </AppText>
                    {recent.map((r) => (
                      <Pressable
                        key={`${r.courseDbId ?? "x"}-${r.apiCourseId ?? "y"}`}
                        onPress={() => onSelectRecent(r)}
                        style={({ pressed }) => [
                          sheet.recentRow,
                          {
                            backgroundColor: colors.surfaceElevated,
                            borderColor: colors.border,
                            opacity: pressed ? 0.9 : 1,
                          },
                        ]}
                      >
                        <Feather name="clock" size={16} color={colors.textTertiary} />
                        <AppText variant="body" style={{ flex: 1, marginLeft: spacing.sm }} numberOfLines={2}>
                          {r.name}
                        </AppText>
                        <Feather name="chevron-right" size={18} color={colors.textTertiary} />
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                {debouncedQuery.length >= 2 && !apiSearched && dbHits.length === 0 && !searchLoading ? (
                  <Pressable
                    onPress={() => void runApiSearch()}
                    style={[sheet.apiBtn, { borderColor: colors.primary, backgroundColor: `${colors.primary}12` }]}
                  >
                    <AppText variant="captionBold" color="primary">
                      Search wider directory
                    </AppText>
                    <AppText variant="small" color="secondary" style={{ marginTop: 4 }}>
                      No local match — query GolfCourseAPI for this name
                    </AppText>
                  </Pressable>
                ) : null}

                {debouncedQuery.length >= 2 && !apiSearched && dbHits.length > 0 ? (
                  <Pressable onPress={() => void runApiSearch()} style={{ marginBottom: spacing.md }} hitSlop={8}>
                    <AppText variant="captionBold" color="primary">
                      + Search directory for more results
                    </AppText>
                  </Pressable>
                ) : null}

                {debouncedQuery.length >= 2 ? (
                  <CourseSearchResults
                    items={listItems}
                    loading={searchLoading || apiLoading}
                    onSelect={onSelectSearchItem}
                    emptyMessage={
                      searchLoading
                        ? "Searching…"
                        : "No courses match yet. Try Search wider directory, or shorten the name."
                    }
                  />
                ) : null}
              </>
            ) : null}

            {manualPick ? (
              <>
                <Pressable
                  onPress={() => {
                    appliedWeatherLinkKey.current = null;
                    setManualPick(null);
                    setForecastTargetYmd(null);
                  }}
                  style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.md, marginBottom: spacing.sm }}
                >
                  <Feather name="arrow-left" size={18} color={colors.primary} />
                  <AppText variant="captionBold" color="primary" style={{ marginLeft: spacing.xs }}>
                    Change course
                  </AppText>
                </Pressable>

                <SelectedCourseHeader
                  name={manualPick.name}
                  subtitle={manualPick.location}
                  sourceHint={manualPick.source === "db" ? "Society course" : "Directory listing"}
                />
                <Pressable
                  onPress={() => void makeManualPickDefault()}
                  style={({ pressed }) => [sheet.defaultBtn, { borderColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Feather name="star" size={14} color={colors.primary} />
                  <AppText variant="captionBold" color="primary" style={{ marginLeft: spacing.xs }}>
                    Set as default course
                  </AppText>
                </Pressable>

                <PlayabilityCard
                  loading={manualBundle.loading}
                  error={manualBundle.error}
                  insight={manualBundle.insight}
                  coordsHint={
                    manualBundle.coords
                      ? `${manualBundle.coords.label} · ${
                          manualBundle.coords.source === "course_db"
                            ? "Saved coordinates"
                            : manualBundle.coords.source === "golf_api"
                              ? "Directory"
                              : "Located"
                        }`
                      : null
                  }
                  onRefresh={manualBundle.refetch}
                />

                {!manualBundle.loading && !manualBundle.error && manualBundle.insight ? (
                  <>
                    <HourlyForecastStrip slots={manualBundle.insight.playTimeline} hours={manualBundle.hourlyStrip} />
                    <DailyForecastBlock days={manualBundle.dailyOutlook} />
                  </>
                ) : null}

                <FiveDayPlayabilityPlanCard
                  loading={manualBundle.loading}
                  forecast={manualBundle.forecast}
                  startDateYmd={fiveDayPlanStartYmd}
                  highlightDateYmd={forecastTargetYmd}
                />

                <CourseActionRow
                  contact={
                    manualBundle.contact ?? {
                      courseName: manualName,
                      lat: null,
                      lng: null,
                      phone: null,
                      websiteUrl: null,
                    }
                  }
                  insight={manualBundle.insight}
                />
              </>
            ) : (
              <AppText variant="small" color="tertiary" style={{ marginTop: spacing.sm }}>
                Pick a course to load coordinates and a full forecast without leaving the app.
              </AppText>
            )}
          </>
        )}

        <View style={{ marginTop: spacing.xl, paddingBottom: spacing.md }}>
          <AppText variant="small" color="tertiary">
            Powered by FairwayWeather.
          </AppText>
        </View>
      </ScrollView>
    </Screen>
  );
}

const sheet = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modeRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  browserCtaCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  browserCtaHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  browserCtaBtn: {
    alignSelf: "flex-start",
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  modeChip: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    alignItems: "center",
  },
  eventCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  eventEyebrow: {
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontSize: 11,
    marginBottom: spacing.xs,
  },
  eventTitle: {
    fontSize: 22,
    lineHeight: 28,
  },
  sectionEyebrow: {
    marginBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontSize: 11,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  apiBtn: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  defaultBtn: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
});
