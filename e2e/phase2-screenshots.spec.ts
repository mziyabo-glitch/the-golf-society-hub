/**
 * Capture live authenticated screenshots for Phase 2 preview QA (full sections).
 */
import fs from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";
import { gotoAuthed, injectSession, loadFixtures, signInSession, waitForText } from "./helpers/phase1";

const fixtures = loadFixtures();
const outDir = "/opt/cursor/artifacts/screenshots";

async function shot(page: import("@playwright/test").Page, name: string) {
  fs.mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, name), fullPage: true });
}

async function login(page: import("@playwright/test").Page, email: string) {
  const session = await signInSession(email, fixtures.password);
  await injectSession(page, session);
}

async function scrollToText(page: import("@playwright/test").Page, pattern: RegExp) {
  const handle = page.getByText(pattern).first();
  if (await handle.count()) {
    await handle.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
  }
}

test.describe("Phase 2 live screenshots v2", () => {
  test("capture scrolled authenticated views", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });

    await login(page, fixtures.accounts.ordinaryMember.email);
    await gotoAuthed(page, "/");
    await waitForText(page, /QA Phase1 M4 Society|Home/i, { timeoutMs: 60_000 });
    await shot(page, "phase2-qa-home-member.png");

    await gotoAuthed(page, "/events");
    await waitForText(page, /Events|QA Phase1/i, { timeoutMs: 60_000 });
    await shot(page, "phase2-qa-events.png");

    await gotoAuthed(page, "/more");
    await waitForText(page, /Other golf tools|Free Play/i, { timeoutMs: 60_000 });
    await scrollToText(page, /Other golf tools|Free Play/i);
    await shot(page, "phase2-qa-more-member.png");
    await scrollToText(page, /Free Play/i);
    await shot(page, "phase2-qa-free-play-row.png");

    await login(page, fixtures.accounts.m4Captain.email);
    await gotoAuthed(page, "/more");
    await waitForText(page, /ManCo|Event administration/i, { timeoutMs: 60_000 });
    await scrollToText(page, /ManCo|Event administration/i);
    await shot(page, "phase2-qa-more-manco.png");

    await gotoAuthed(page, "/tee-sheet");
    await waitForText(page, /Events|Open an event/i, { timeoutMs: 60_000 });
    await page.waitForTimeout(2000);
    await shot(page, "phase2-qa-teesheet-redirect.png");

    await gotoAuthed(page, "/birdies-league");
    await waitForText(page, /Rivalries/i, { timeoutMs: 60_000 });
    await page.waitForTimeout(2000);
    await shot(page, "phase2-qa-birdies-redirect.png");

    await gotoAuthed(page, "/course-data");
    await waitForText(page, /More|Opening More|Other golf tools/i, { timeoutMs: 60_000 });
    await page.waitForTimeout(2500);
    await shot(page, "phase2-qa-course-data-rejected.png");

    await login(page, fixtures.accounts.platformAdmin.email);
    await gotoAuthed(page, "/more");
    await waitForText(page, /Platform administration|Product usage report|Course data/i, {
      timeoutMs: 60_000,
    });
    await scrollToText(page, /Platform administration|Product usage report/i);
    await shot(page, "phase2-qa-more-platform-admin.png");

    // Mobile-width member More
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, fixtures.accounts.ordinaryMember.email);
    await gotoAuthed(page, "/more");
    await waitForText(page, /Free Play|Other golf tools/i, { timeoutMs: 60_000 });
    await scrollToText(page, /Free Play/i);
    await shot(page, "phase2-qa-more-member-mobile.png");
  });
});
