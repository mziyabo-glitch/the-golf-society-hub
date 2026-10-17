/**
 * App configuration for share links and distribution mode.
 * Switch APP_STAGE to control rivalry invite links during beta vs production.
 */

export type AppStage = "beta" | "production";

/** Set to "beta" during Vercel testing; "production" when apps are live. */
export const APP_STAGE: AppStage =
  (process.env.EXPO_PUBLIC_APP_STAGE?.toLowerCase().trim() as AppStage) || "beta";

/** Legacy alias for backward compatibility. */
export const APP_MODE = APP_STAGE;

const VERCEL_WEB_URL = "https://the-golf-society-hub.vercel.app";

/** Canonical web origin for deep links, password reset, and calendar/invite URLs (override with EXPO_PUBLIC_WEB_BASE_URL). */
export function getPublicWebBaseUrl(): string {
  const fromEnv =
    typeof process !== "undefined" && typeof process.env.EXPO_PUBLIC_WEB_BASE_URL === "string"
      ? process.env.EXPO_PUBLIC_WEB_BASE_URL.trim()
      : "";
  return (fromEnv || VERCEL_WEB_URL).replace(/\/$/, "");
}

function isExpoWebDevLocalApiHost(): boolean {
  if (typeof window === "undefined" || !window.location) return false;
  const { hostname, port } = window.location;
  return hostname === "localhost" && (port === "8081" || port === "19006");
}

/**
 * Base URL for subscribed calendar feeds (.ics). On Expo web dev, points at dev-api-server
 * so the same Supabase project as the app can serve the feed locally.
 */
export function getCalendarSubscribeFeedBaseUrl(): string {
  if (isExpoWebDevLocalApiHost()) return "http://localhost:3001";
  return getPublicWebBaseUrl();
}

/** Full subscribe URL for Apple/Google calendar (opaque token from ensure_calendar_feed_token). */
export function getCalendarSubscribeUrl(feedToken: string): string {
  const base = getCalendarSubscribeFeedBaseUrl().replace(/\/$/, "");
  const t = encodeURIComponent(String(feedToken).trim());
  return `${base}/api/calendar/${t}.ics`;
}

/** Web link for lightweight event RSVP (/invite/{eventUuid}). */
export function getEventRsvpInviteUrl(eventId: string): string {
  const id = String(eventId).trim();
  return `${getPublicWebBaseUrl()}/invite/${encodeURIComponent(id)}`;
}

export function getEventRsvpInviteShareMessage(opts: {
  eventId: string;
  eventName: string;
  date?: string;
  societyName?: string;
}): string {
  const when = opts.date?.trim() ? ` — ${opts.date.trim()}` : "";
  const soc = opts.societyName?.trim() ? ` (${opts.societyName.trim()})` : "";
  return `You're invited: ${opts.eventName}${when}${soc}\n\nRSVP here (member or guest):\n${getEventRsvpInviteUrl(opts.eventId)}`;
}
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.thegolfsocietyhub.app";
const APP_STORE_URL = "https://apps.apple.com/app/the-golf-society-hub/id6740041032";

/**
 * Returns the full rivalry invite URL for beta (Vercel + join-rivalry route).
 */
export function getRivalryInviteUrl(joinCode: string): string {
  const code = String(joinCode).trim().toUpperCase();
  return `${getPublicWebBaseUrl()}/join-rivalry?code=${encodeURIComponent(code)}`;
}

/**
 * Returns the app link text for Rivalries share messages.
 * Beta: Vercel URL only (no App Store / Play Store).
 * Production: App Store and Play Store download links.
 */
export function getRivalryShareLinkText(joinCode: string): string {
  const code = String(joinCode).trim().toUpperCase();
  if (APP_STAGE === "beta") {
    return `Open here:\n${getRivalryInviteUrl(code)}\n\nOr use join code: ${code}`;
  }
  return `Download the app:\nAndroid: ${PLAY_STORE_URL}\niOS: ${APP_STORE_URL}\n\nOr use join code: ${code}`;
}

/** Beta invite message format — always uses Vercel link, never store links. */
export function getRivalryInviteMessage(
  title: string,
  joinCode: string,
  inviterDisplayName?: string | null,
): string {
  const code = String(joinCode).trim().toUpperCase();
  const who = inviterDisplayName?.trim();
  const lead = who
    ? `Join my rivalry "${title}" on The Golf Society Hub! — from ${who}`
    : `Join my rivalry "${title}" on The Golf Society Hub!`;
  return `${lead}\n\nOpen here:\n${getRivalryInviteUrl(code)}\n\nOr use join code: ${code}`;
}

/**
 * Returns the society invite URL for captain to share.
 * When a user opens this link, they are prompted to sign in (if needed),
 * then enter name, WHS index, and emergency contact before joining.
 */
export function getSocietyInviteUrl(joinCode: string): string {
  const code = String(joinCode).trim().toUpperCase();
  return `${getPublicWebBaseUrl()}/invite/${encodeURIComponent(code)}`;
}

/**
 * Returns the share message for society invite (captain shares via WhatsApp, SMS, etc.).
 */
export function getSocietyInviteMessage(societyName: string, joinCode: string): string {
  const code = String(joinCode).trim().toUpperCase();
  return `Join ${societyName} on The Golf Society Hub!\n\nOpen here:\n${getSocietyInviteUrl(code)}\n\nOr use join code: ${code}`;
}
