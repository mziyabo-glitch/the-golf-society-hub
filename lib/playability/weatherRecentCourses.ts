import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "@golf_society_hub/weather_recent_courses_v1";
const DEFAULT_KEY = "@golf_society_hub/weather_default_course_v1";

export type RecentWeatherCourse = {
  courseDbId: string | null;
  apiCourseId: number | null;
  name: string;
};

const MAX = 8;

export async function loadRecentWeatherCourses(): Promise<RecentWeatherCourse[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x) => x && typeof x.name === "string" && (x.courseDbId || x.apiCourseId != null),
    );
  } catch {
    return [];
  }
}

export async function rememberWeatherCourse(entry: RecentWeatherCourse): Promise<void> {
  if (!entry.name?.trim()) return;
  const cur = await loadRecentWeatherCourses();
  const next = [
    {
      courseDbId: entry.courseDbId,
      apiCourseId: entry.apiCourseId,
      name: entry.name.trim(),
    },
    ...cur.filter(
      (c) =>
        !(
          (entry.courseDbId && c.courseDbId === entry.courseDbId) ||
          (entry.apiCourseId != null && c.apiCourseId === entry.apiCourseId)
        ),
    ),
  ].slice(0, MAX);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}

export async function loadDefaultWeatherCourse(): Promise<RecentWeatherCourse | null> {
  try {
    const raw = await AsyncStorage.getItem(DEFAULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.name !== "string" ||
      (!parsed.courseDbId && parsed.apiCourseId == null)
    ) {
      return null;
    }
    return {
      courseDbId: parsed.courseDbId ?? null,
      apiCourseId: parsed.apiCourseId ?? null,
      name: parsed.name,
    };
  } catch {
    return null;
  }
}

export async function setDefaultWeatherCourse(entry: RecentWeatherCourse): Promise<void> {
  if (!entry.name?.trim()) return;
  await AsyncStorage.setItem(
    DEFAULT_KEY,
    JSON.stringify({
      courseDbId: entry.courseDbId,
      apiCourseId: entry.apiCourseId,
      name: entry.name.trim(),
    }),
  );
}
