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

async function openTeeSheet(
  page: import("@playwright/test").Page,
  accountEmail: string,
  eventId: string,
  ready: RegExp,
) {
  const session = await signInSession(accountEmail, fixtures.password);
  await injectSession(page, session);
  await gotoAuthed(page, `/tee-sheet?eventId=${eventId}`);
  await waitForText(page, ready, { timeoutMs: 90_000 });
  await waitForText(page, /Save Draft/i, { timeoutMs: 90_000 });
  return session;
}

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
    await openTeeSheet(
      page,
      fixtures.accounts.m4Captain.email,
      fixtures.events.m4Standard,
      /Manage Tee Sheet — QA Phase1 M4 Standard Event/i,
    );
    const text = await bodyText(page);
    expect(text).toMatch(/Save Draft/i);
    expect(text).not.toMatch(/Access Restricted/i);
  });

  test("ZGS ManCo can open ZGS standard tee sheet", async ({ page }) => {
    await openTeeSheet(
      page,
      fixtures.accounts.zgsCaptain.email,
      fixtures.events.zgsStandard,
      /Manage Tee Sheet — QA Phase1 ZGS Standard Event/i,
    );
    const text = await bodyText(page);
    expect(text).toMatch(/Save Draft/i);
    expect(text).not.toMatch(/Access Restricted/i);
  });

  test("cross-society event access is rejected", async ({ page }) => {
    const session = await signInSession(fixtures.accounts.m4Captain.email, fixtures.password);
    await injectSession(page, session);
    await gotoAuthed(page, `/tee-sheet?eventId=${fixtures.events.other}`);
    let text = "";
    const started = Date.now();
    while (Date.now() - started < 60_000) {
      text = await bodyText(page);
      if (
        /Access Restricted/i.test(text) ||
        /do not have permission/i.test(text) ||
        /QA Phase1 Other Society Event/i.test(text)
      ) {
        break;
      }
      await page.waitForTimeout(1000);
    }
    expect(text).not.toMatch(/QA Phase1 Other Society Event/i);
    expect(text).not.toMatch(/QA Other Captain/i);
  });
});
