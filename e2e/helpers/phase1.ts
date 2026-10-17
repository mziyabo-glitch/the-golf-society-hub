import fs from "node:fs";
import path from "node:path";
import { createClient, type Session } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

export type Phase1Fixtures = {
  run: string;
  password: string;
  baseUrlHint: string;
  accounts: {
    m4Captain: { email: string; userId: string; memberId: string; societyId: string };
    zgsCaptain: { email: string; userId: string; memberId: string; societyId: string };
    dual: {
      email: string;
      userId: string;
      societyId: string;
      m4MemberId: string;
      zgsMemberId: string;
    };
    ordinaryMember: { email: string; userId: string; memberId: string; societyId: string };
    platformAdmin: { email: string; userId: string };
    otherCaptain: { email: string; userId: string; memberId: string; societyId: string };
  };
  societies: { m4: string; zgs: string; other: string };
  events: { m4Standard: string; zgsStandard: string; joint: string; other: string };
  players: Record<string, { id: string; name: string }>;
};

export function loadFixtures(): Phase1Fixtures {
  const file = path.join(__dirname, "..", "fixtures", "phase1.json");
  if (!fs.existsSync(file)) {
    throw new Error(
      `Missing ${file}. Run scripts/qa/fetch-fixtures.mjs after seeding (scripts/qa/seed-phase1-fixtures.sql).`,
    );
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as Phase1Fixtures;
}

export function supabaseAnon() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL / ANON_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function signInSession(email: string, password: string): Promise<Session> {
  const sb = supabaseAnon();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`signIn failed for ${email}: ${error?.message ?? "no session"}`);
  }
  return data.session;
}

/** Inject Supabase session used by the web app (`gsh:supabase-auth`). */
export async function injectSession(page: Page, session: Session): Promise<void> {
  await page.addInitScript((sess) => {
    window.localStorage.setItem("gsh:supabase-auth", JSON.stringify(sess));
  }, session);
}

export async function dismissBrowserTabBanner(page: Page): Promise<void> {
  const dismiss = page.getByText("Dismiss", { exact: true });
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click().catch(() => {});
  }
}

export async function gotoAuthed(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await dismissBrowserTabBanner(page);
}

export async function bodyText(page: Page): Promise<string> {
  return page.locator("body").innerText();
}

export async function waitForText(
  page: Page,
  pattern: RegExp,
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const started = Date.now();
  let last = "";
  while (Date.now() - started < timeoutMs) {
    last = await bodyText(page);
    if (pattern.test(last)) return last;
    await page.waitForTimeout(1000);
  }
  throw new Error(`Timed out waiting for ${pattern}. Last body snippet:\n${last.slice(0, 1200)}`);
}

export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while (true) {
    const found = haystack.indexOf(needle, idx);
    if (found < 0) break;
    count += 1;
    idx = found + needle.length;
  }
  return count;
}
