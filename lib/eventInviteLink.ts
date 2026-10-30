/**
 * Event RSVP links use /invite/{eventUuid} (same path segment as society join codes,
 * but UUID shape distinguishes the flow in invite/[code].tsx and root layout guards).
 */

import { Linking, Share } from "react-native";

const EVENT_INVITE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isEventInviteUuid(raw: string): boolean {
  return EVENT_INVITE_UUID.test(String(raw || "").trim());
}

/** True when pathname is /invite/<uuid> (web or expo pathname). */
export function isEventRsvpInvitePath(pathname?: string | null): boolean {
  if (typeof pathname !== "string") return false;
  const m = pathname.match(/^\/invite\/([^/?#]+)$/i);
  if (!m) return false;
  const seg = decodeURIComponent(m[1]).trim();
  return isEventInviteUuid(seg);
}

/** Open WhatsApp with prefilled text, or fall back to system share sheet. */
export async function shareViaWhatsAppOrFallback(message: string): Promise<void> {
  const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
  try {
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
      return;
    }
  } catch {
    /* use Share */
  }
  await Share.share({ message });
}
