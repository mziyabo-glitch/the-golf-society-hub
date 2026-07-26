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

async function openReady(
  page: import("@playwright/test").Page,
  email: string,
  eventId: string,
  title: RegExp,
) {
  const session = await signInSession(email, fixtures.password);
  await injectSession(page, session);
  await gotoAuthed(page, `/tee-sheet?eventId=${eventId}`);
  await waitForText(page, title, { timeoutMs: 90_000 });
  await waitForText(page, /Save Draft/i, { timeoutMs: 90_000 });
  return session;
}

test.describe("player pools", () => {
  test("standard-event paid-player pool includes paid and excludes unpaid", async ({ page }) => {
    await openReady(
      page,
      fixtures.accounts.m4Captain.email,
      fixtures.events.m4Standard,
      /Manage Tee Sheet — QA Phase1 M4 Standard Event/i,
    );
    const text = await bodyText(page);
    expect(text).toMatch(/QA Paid Player/);
    expect(text).toMatch(/QA Dual Member/);
    expect(text).toMatch(/QA Ordinary Member/);
    expect(text).not.toMatch(/QA Unpaid Player/);
    expect(text).not.toMatch(/QA Late Paid Player/);
  });

  test("joint M4/ZGS player pool includes both societies", async ({ page }) => {
    await openReady(
      page,
      fixtures.accounts.m4Captain.email,
      fixtures.events.joint,
      /Manage Tee Sheet — QA Phase1 Joint M4\/ZGS Event/i,
    );
    const text = await bodyText(page);
    expect(text).toMatch(/QA Paid Player/);
    expect(text).toMatch(/QA ZGS Paid Player/);
    expect(text).toMatch(/QA Dual Member/);
  });

  test("dual-member is deduplicated on joint sheet", async ({ page }) => {
    await openReady(
      page,
      fixtures.accounts.m4Captain.email,
      fixtures.events.joint,
      /Manage Tee Sheet — QA Phase1 Joint M4\/ZGS Event/i,
    );
    const text = await bodyText(page);
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
    await waitForText(page, /Manage Tee Sheet — QA Phase1 M4 Standard Event/i, {
      timeoutMs: 90_000,
    });
    await waitForText(page, /Save Draft/i, { timeoutMs: 90_000 });
    expect(await bodyText(page)).not.toMatch(/QA Late Paid Player/);

    await markPaid(true);

    // Reload editor, then regenerate from eligible pool so late-paid joins the sheet.
    await gotoAuthed(page, `/tee-sheet?eventId=${fixtures.events.m4Standard}`);
    await waitForText(page, /Save Draft/i, { timeoutMs: 90_000 });
    await page.getByText(/Edit Groups/i).first().click();
    await page.waitForTimeout(1500);
    page.once("dialog", (d) => d.accept().catch(() => {}));
    const regen = page.getByText(/Regenerate/i).first();
    await regen.scrollIntoViewIfNeeded().catch(() => {});
    await regen.click({ timeout: 30_000 });
    await page.waitForTimeout(4000);
    const text = await waitForText(page, /QA Late Paid Player/i, { timeoutMs: 60_000 });
    expect(text).toMatch(/QA Late Paid Player/);

    await markPaid(false);
  });
});
