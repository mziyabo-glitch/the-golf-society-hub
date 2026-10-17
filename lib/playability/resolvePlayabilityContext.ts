/**
 * Resolves coordinates for playability from DB course, Golf API id, or geocoded name.
 */

import { getCourseLocationById } from "@/lib/db_supabase/courseRepo";
import { getCourseById } from "@/lib/golfApi";
import { geocodePlaceName } from "./geocoding";
import type { ResolvedCourseCoords } from "./types";
import { enrichCourseContact, type CourseContactBundle } from "./courseContactLayer";

export type ResolveInput = {
  courseId?: string | null;
  apiCourseId?: number | null;
  courseNameFallback: string;
};

export type ResolvedPlayabilityContext = {
  coords: ResolvedCourseCoords | null;
  contact: CourseContactBundle;
};

export async function resolvePlayabilityContext(input: ResolveInput): Promise<ResolvedPlayabilityContext> {
  const name = input.courseNameFallback?.trim() || "Golf course";

  if (input.courseId) {
    const row = await getCourseLocationById(input.courseId);
    const contact = await enrichCourseContact(row, name);
    if (row?.lat != null && row?.lng != null) {
      return {
        coords: { lat: row.lat, lng: row.lng, label: contact.courseName, source: "course_db" },
        contact,
      };
    }
    const contactOnly = await enrichCourseContact(row, name);
    const apiId = input.apiCourseId ?? row?.api_id ?? null;
    if (apiId != null) {
      try {
        const api = await getCourseById(apiId);
        const lat = api.lat ?? api.latitude;
        const lng = api.lng ?? api.longitude;
        if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
          return {
            coords: { lat: Number(lat), lng: Number(lng), label: api.name || name, source: "golf_api" },
            contact: contactOnly,
          };
        }
      } catch {
        /* fall through */
      }
    }
    const geo = await geocodePlaceName(contactOnly.courseName);
    if (geo) {
      return {
        coords: { lat: geo.lat, lng: geo.lng, label: geo.label, source: "geocode" },
        contact: contactOnly,
      };
    }
    return { coords: null, contact: contactOnly };
  }

  if (input.apiCourseId != null) {
    try {
      const api = await getCourseById(input.apiCourseId);
      const lat = api.lat ?? api.latitude;
      const lng = api.lng ?? api.longitude;
      const contact: CourseContactBundle = {
        courseName: api.name || name,
        lat: lat != null ? Number(lat) : null,
        lng: lng != null ? Number(lng) : null,
        phone: null,
        websiteUrl: null,
        apiCourseId: api.id,
      };
      if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
        return {
          coords: { lat: Number(lat), lng: Number(lng), label: contact.courseName, source: "golf_api" },
          contact,
        };
      }
    } catch {
      /* fall through */
    }
  }

  const geo = await geocodePlaceName(name);
  if (geo) {
    return {
      coords: { lat: geo.lat, lng: geo.lng, label: geo.label, source: "geocode" },
      contact: {
        courseName: name,
        lat: geo.lat,
        lng: geo.lng,
        phone: null,
        websiteUrl: null,
      },
    };
  }

  return {
    coords: null,
    contact: { courseName: name, lat: null, lng: null, phone: null, websiteUrl: null },
  };
}
