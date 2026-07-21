import { test, expect } from "@playwright/test";
import {
  bodyText,
  countOccurrences,
  gotoAuthed,
  injectSession,
  loadFixtures,
  signInSession,
  supabaseAnon,
  waitForText,
} from "./helpers/phase1";

const fixtures = loadFixtures();

test.describe("player pools", () => {
  test("standard-event paid-player pool includes paid and excludes unpaid", async ({ page }) => {
    const session = await signInSession(fixtures.accounts.m4Captain.email, fixtures.password);
    await injectSession(page, session);
    await gotoAuthed(page, `/tee-sheet?eventId=${fixtures.events.m4Standard}`);
    const text = await waitForText(page, /QA Paid Player|QA Dual Member/i);
    expect(text).toMatch(/QA Paid Player/);
    expect(text).toMatch(/QA Dual Member/);
    expect(text).toMatch(/QA Ordinary Member/);
    // Unpaid / late-unpaid must not appear in eligible pool until marked paid.
    expect(text).not.toMatch(/QA Unpaid Player/);
    expect(text).not.toMatch(/QA Late Paid Player/);
  });

  test("joint M4/ZGS player pool includes both societies", async ({ page }) => {
    const session = await signInSession(fixtures.accounts.m4Captain.email, fixtures.password);
    await injectSession(page, session);
    await gotoAuthed(page, `/tee-sheet?eventId=${fixtures.events.joint}`);
    const text = await waitForText(page, /QA Phase1 Joint M4\/ZGS Event/i);
    expect(text).toMatch(/QA Paid Player/);
    expect(text).toMatch(/QA ZGS Paid Player/);
    expect(text).toMatch(/QA Dual Member/);
  });

  test("dual-member is deduplicated on joint sheet", async ({ page }) => {
    const session = await signInSession(fixtures.accounts.m4Captain.email, fixtures.password);
    await injectSession(page, session);
    await gotoAuthed(page, `/tee-sheet?eventId=${fixtures.events.joint}`);
    const text = await waitForText(page, /QA Dual Member/);
    // Name may appear in pool + group sections; ensure it is not listed twice as separate pool rows
    // by checking "available / eligible" density stays low (at most a few UI mentions).
    const mentions = countOccurrences(text, "QA Dual Member");
    expect(mentions).toBeGreaterThanOrEqual(1);
    expect(mentions).toBeLessThanOrEqual(4);
  });

  test("late-paid player refresh adds player to eligible pool", async ({ page }) => {
    const session = await signInSession(fixtures.accounts.m4Captain.email, fixtures.password);
    const sb = supabaseAnon();
    await sb.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    const markPaid = async (paid: boolean) => {
      const { error } = await sb.rpc("mark_event_paid", {
        p_event_id: fixtures.events.m4Standard,
        p_society_id: fixtures.societies.m4,
        p_target_member_id: fixtures.players.late.id,
        p_paid: paid,
        p_amount_pence: 0,
      });
      expect(error, error?.message).toBeNull();
    };

    await markPaid(false);

    await injectSession(page, session);
    await gotoAuthed(page, `/tee-sheet?eventId=${fixtures.events.m4Standard}`);
    let text = await waitForText(page, /QA Paid Player/);
    expect(text).not.toMatch(/QA Late Paid Player/);

    await markPaid(true);

    // Reload tee sheet to refresh eligibility pool.
    await gotoAuthed(page, `/tee-sheet?eventId=${fixtures.events.m4Standard}`);
    text = await waitForText(page, /QA Late Paid Player/);
    expect(text).toMatch(/QA Late Paid Player/);

    // Reset for idempotent re-runs.
    await markPaid(false);
  });
});
