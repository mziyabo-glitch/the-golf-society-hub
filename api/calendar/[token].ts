/**
 * Subscribed calendar feed: GET /api/calendar/{secret}.ics
 * Requires SUPABASE_SERVICE_ROLE_KEY on the deployment.
 */

import { getCalendarIcsForToken } from "../../lib/calendarIcsFeed";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  const { status, body, headers } = await getCalendarIcsForToken(last);
  return new Response(body, { status, headers });
}
