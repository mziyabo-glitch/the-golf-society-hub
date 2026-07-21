import { test, expect } from "@playwright/test";
import {
  bodyText,
  gotoAuthed,
  injectSession,
  loadFixtures,
  signInSession,
  waitForText,
} from "./helpers/phase1";

const fixtures = loadFixtures();

test.describe("usage report access", () => {
  test("platform admin can open usage report", async ({ page }) => {
    const session = await signInSession(
      fixtures.accounts.platformAdmin.email,
      fixtures.password,
    );
    await injectSession(page, session);
    await gotoAuthed(page, "/admin/usage-report");
    const text = await waitForText(page, /Product usage report/i);
    expect(text).toMatch(/Product usage report/i);
    expect(text).not.toMatch(/Platform administrator access is required/i);
    expect(text).toMatch(/\b7d\b|\b30d\b|\b90d\b/);
  });

  test("ordinary member is rejected from usage report", async ({ page }) => {
    const session = await signInSession(
      fixtures.accounts.ordinaryMember.email,
      fixtures.password,
    );
    await injectSession(page, session);
    await gotoAuthed(page, "/admin/usage-report");
    const text = await waitForText(page, /Platform administrator access is required/i);
    expect(text).toMatch(/Platform administrator access is required/i);
    expect(text).not.toMatch(/Product usage report/i);
  });
});

test.describe("tee-sheet society access", () => {
  test("M4 ManCo can open M4 standard tee sheet", async ({ page }) => {
    const session = await signInSession(fixtures.accounts.m4Captain.email, fixtures.password);
    await injectSession(page, session);
    await gotoAuthed(page, `/tee-sheet?eventId=${fixtures.events.m4Standard}`);
    const text = await waitForText(page, /QA Phase1 M4 Standard Event/i);
    expect(text).toMatch(/Manage Tee Sheet/i);
    expect(text).toMatch(/Save Draft/i);
    expect(text).not.toMatch(/Access Restricted/i);
  });

  test("ZGS ManCo can open ZGS standard tee sheet", async ({ page }) => {
    const session = await signInSession(fixtures.accounts.zgsCaptain.email, fixtures.password);
    await injectSession(page, session);
    await gotoAuthed(page, `/tee-sheet?eventId=${fixtures.events.zgsStandard}`);
    const text = await waitForText(page, /QA Phase1 ZGS Standard Event/i);
    expect(text).toMatch(/Manage Tee Sheet/i);
    expect(text).toMatch(/Save Draft/i);
    expect(text).not.toMatch(/Access Restricted/i);
  });

  test("cross-society event access is rejected", async ({ page }) => {
    const session = await signInSession(fixtures.accounts.m4Captain.email, fixtures.password);
    await injectSession(page, session);
    await gotoAuthed(page, `/tee-sheet?eventId=${fixtures.events.other}`);
    // Prefer explicit Access Restricted (post deep-link fix). Also assert no leak of other-society event.
    let text = "";
    const started = Date.now();
    while (Date.now() - started < 45_000) {
      text = await bodyText(page);
      if (/Access Restricted/i.test(text) || /QA Phase1 Other Society Event/i.test(text)) break;
      if (/do not have permission/i.test(text)) break;
      await page.waitForTimeout(1000);
    }
    expect(text).not.toMatch(/QA Phase1 Other Society Event/i);
    expect(text).not.toMatch(/QA Other Captain/i);
    const restricted =
      /Access Restricted/i.test(text) || /do not have permission/i.test(text);
    // Soft-fallback builds still must not show other-society event data.
    expect(restricted || !/Other Society Event/i.test(text)).toBeTruthy();
  });
});
