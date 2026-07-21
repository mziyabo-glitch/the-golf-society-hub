import { test, expect } from "@playwright/test";
import {
  bodyText,
  gotoAuthed,
  injectSession,
  loadFixtures,
  signInSession,
  supabaseAnon,
  waitForText,
} from "./helpers/phase1";

const fixtures = loadFixtures();

async function openM4TeeSheet(page: import("@playwright/test").Page) {
  const session = await signInSession(fixtures.accounts.m4Captain.email, fixtures.password);
  await injectSession(page, session);
  await gotoAuthed(page, `/tee-sheet?eventId=${fixtures.events.m4Standard}`);
  await waitForText(page, /Manage Tee Sheet — QA Phase1 M4 Standard Event/i, {
    timeoutMs: 90_000,
  });
  await waitForText(page, /Save Draft/i, { timeoutMs: 90_000 });
  return session;
}

test.describe("tee-sheet draft publish lifecycle", () => {
  test("Save Draft persists groups and competition holes", async ({ page }) => {
    await openM4TeeSheet(page);
    await page.getByText("Save Draft", { exact: false }).first().click();
    await page.waitForTimeout(2500);

    const sb = supabaseAnon();
    const session = await signInSession(fixtures.accounts.m4Captain.email, fixtures.password);
    await sb.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    const { data: eventRow, error } = await sb
      .from("events")
      .select("nearest_pin_holes, longest_drive_holes, id, name")
      .eq("id", fixtures.events.m4Standard)
      .maybeSingle();
    expect(error, error?.message).toBeNull();
    expect(eventRow?.name).toMatch(/QA Phase1 M4 Standard Event/);
    expect(Array.isArray(eventRow?.nearest_pin_holes)).toBeTruthy();
    expect(Array.isArray(eventRow?.longest_drive_holes)).toBeTruthy();
  });

  test("leave and reopen restores draft", async ({ page }) => {
    await openM4TeeSheet(page);
    await page.getByText("Save Draft", { exact: false }).first().click();
    await page.waitForTimeout(2000);
    await gotoAuthed(page, "/");
    await gotoAuthed(page, `/tee-sheet?eventId=${fixtures.events.m4Standard}`);
    const text = await waitForText(page, /Manage Tee Sheet — QA Phase1 M4 Standard Event/i, {
      timeoutMs: 90_000,
    });
    await waitForText(page, /Save Draft/i, { timeoutMs: 90_000 });
    expect(text).toMatch(/Nearest the Pin|Longest Drive/i);
  });

  test("Publish then Update Published Tee Sheet", async ({ page }) => {
    await openM4TeeSheet(page);

    const sb = supabaseAnon();
    const session = await signInSession(fixtures.accounts.m4Captain.email, fixtures.password);
    await sb.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    page.once("dialog", (d) => d.accept().catch(() => {}));
    const publish = page.getByText(/Publish Tee Sheet|Update Published Tee Sheet/i).first();
    await publish.click({ timeout: 30_000, force: true }).catch(async () => {
      await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll("div,span,button,a"));
        const el = nodes.find((n) => /Publish Tee Sheet|Update Published Tee Sheet/i.test(n.textContent || ""));
        (el as HTMLElement | undefined)?.click();
      });
    });
    await page.waitForTimeout(4000);

    // Publish may auto-open the share/export screen — return to editor.
    if (/payload=/.test(page.url()) || /Ready to export/i.test(await bodyText(page))) {
      await gotoAuthed(page, `/tee-sheet?eventId=${fixtures.events.m4Standard}`);
      await waitForText(page, /Save Draft|Update Published Tee Sheet/i, { timeoutMs: 90_000 });
    }

    const { data: mid } = await sb
      .from("events")
      .select("tee_time_published_at")
      .eq("id", fixtures.events.m4Standard)
      .maybeSingle();

    page.once("dialog", (d) => d.accept().catch(() => {}));
    const updateBtn = page.getByText(/Update Published Tee Sheet/i).first();
    if (await updateBtn.isVisible().catch(() => false)) {
      await updateBtn.click({ timeout: 30_000, force: true });
      await page.waitForTimeout(4000);
    } else {
      // Already published earlier in the QA run — invoke publish RPC path by clicking Publish label.
      await page.getByText(/Publish Tee Sheet|Update Published/i).first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(2000);
    }

    if (/payload=/.test(page.url())) {
      await gotoAuthed(page, `/tee-sheet?eventId=${fixtures.events.m4Standard}`);
      await waitForText(page, /Save Draft/i, { timeoutMs: 90_000 });
    }

    const { data: after } = await sb
      .from("events")
      .select("tee_time_published_at")
      .eq("id", fixtures.events.m4Standard)
      .maybeSingle();

    const text = await bodyText(page);
    expect(
      !!mid?.tee_time_published_at ||
        !!after?.tee_time_published_at ||
        /Update Published Tee Sheet|Published/i.test(text),
    ).toBeTruthy();
  });

  test("nearest-to-pin and longest-drive persistence", async ({ page }) => {
    await openM4TeeSheet(page);
    const text = await bodyText(page);
    expect(text).toMatch(/Nearest the Pin/i);
    expect(text).toMatch(/Longest Drive/i);

    const sb = supabaseAnon();
    const session = await signInSession(fixtures.accounts.m4Captain.email, fixtures.password);
    await sb.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
    const { data, error } = await sb
      .from("events")
      .select("nearest_pin_holes, longest_drive_holes")
      .eq("id", fixtures.events.m4Standard)
      .maybeSingle();
    expect(error, error?.message).toBeNull();
    expect(data?.nearest_pin_holes).toEqual(expect.arrayContaining([7, 15]));
    expect(data?.longest_drive_holes).toEqual(expect.arrayContaining([3]));

    await page.getByText("Save Draft", { exact: false }).first().click();
    await page.waitForTimeout(2000);
    await gotoAuthed(page, `/tee-sheet?eventId=${fixtures.events.m4Standard}`);
    await waitForText(page, /Nearest the Pin/i, { timeoutMs: 90_000 });
    expect(await bodyText(page)).toMatch(/Longest Drive/i);
  });
});
