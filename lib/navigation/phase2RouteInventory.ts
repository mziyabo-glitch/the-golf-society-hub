/**
 * Phase 2 route inventory — remaining authenticated routes and intended entry points.
 * Direct-use / flag-gated routes are documented so they are not mistaken for dead code.
 */

export type RouteInventoryEntry = {
  route: string;
  entry: "tab" | "more" | "event" | "settings" | "platform_admin" | "deep_link" | "flag_gated" | "redirect";
  purpose: string;
};

/** Post–Phase 2 inventory of primary app routes (not exhaustive of every dynamic param). */
export const PHASE2_ROUTE_INVENTORY: RouteInventoryEntry[] = [
  { route: "/(app)/(tabs)/", entry: "tab", purpose: "Home" },
  { route: "/(app)/(tabs)/events", entry: "tab", purpose: "Events list" },
  { route: "/(app)/(tabs)/sinbook", entry: "tab", purpose: "Rivalries" },
  { route: "/(app)/(tabs)/leaderboard", entry: "tab", purpose: "Order of Merit" },
  { route: "/(app)/(tabs)/more", entry: "tab", purpose: "More hub" },
  { route: "/(app)/(tabs)/members", entry: "more", purpose: "Member directory" },
  { route: "/(app)/(tabs)/settings", entry: "more", purpose: "Society settings" },
  { route: "/(app)/(tabs)/scorecard", entry: "flag_gated", purpose: "Live gross hub; redirects unless today event has flag" },
  { route: "/(app)/(tabs)/weather", entry: "deep_link", purpose: "Weather (hidden tab)" },
  { route: "/(app)/tee-sheet?eventId=", entry: "event", purpose: "ManCo tee-sheet editor from Manage Event" },
  { route: "/(app)/tee-sheet", entry: "redirect", purpose: "Bare generator → Events" },
  { route: "/(app)/event/[id]", entry: "event", purpose: "Event overview / signup" },
  { route: "/(app)/event/[id]/manage", entry: "event", purpose: "Event management" },
  { route: "/(app)/event/[id]/tee-sheet", entry: "event", purpose: "Published member tee sheet" },
  { route: "/(app)/event/[id]/gross-scores/*", entry: "flag_gated", purpose: "Live gross; requires event flag" },
  { route: "/(app)/free-play", entry: "more", purpose: "Free Play under Other golf tools" },
  { route: "/(app)/free-play/[id]", entry: "deep_link", purpose: "Historical / active free-play rounds" },
  { route: "/(app)/birdies-league", entry: "flag_gated", purpose: "Redirects while BIRDIES_LEAGUE_UI_ENABLED=false" },
  { route: "/(app)/course-data", entry: "platform_admin", purpose: "Course data administration" },
  { route: "/(app)/admin/usage-report", entry: "platform_admin", purpose: "Product usage report" },
  { route: "/(app)/admin/course-domains", entry: "platform_admin", purpose: "Club domain review" },
  { route: "/(app)/society", entry: "redirect", purpose: "Legacy stub → Settings" },
  { route: "/(app)/billing", entry: "more", purpose: "Billing & licences (Captain / platform)" },
  { route: "/(app)/treasurer", entry: "more", purpose: "Society ledger" },
  { route: "/(app)/event-finance", entry: "more", purpose: "Event finances" },
  { route: "/(app)/membership-fees", entry: "more", purpose: "Membership fees" },
  { route: "/(app)/my-profile", entry: "more", purpose: "Profile" },
  { route: "/(app)/roll-of-honour", entry: "event", purpose: "OOM roll of honour" },
];

/** Links that must not appear as primary navigation after Phase 2. */
export const PHASE2_REMOVED_NAV_PATTERNS = [
  "Tee sheet generator",
  "Birdies League",
  "Course Data Editor",
  "Course data review",
  "Free Play Scorecard",
] as const;

export function inventoryHasEntryPoint(routePrefix: string): boolean {
  return PHASE2_ROUTE_INVENTORY.some(
    (row) => row.route === routePrefix || row.route.startsWith(routePrefix.replace(/\*$/, "")),
  );
}
