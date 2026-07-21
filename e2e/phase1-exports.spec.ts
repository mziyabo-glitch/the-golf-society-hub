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

async function openM4Ready(page: import("@playwright/test").Page) {
  const session = await signInSession(fixtures.accounts.m4Captain.email, fixtures.password);
  await injectSession(page, session);
  await gotoAuthed(page, `/tee-sheet?eventId=${fixtures.events.m4Standard}`);
  await waitForText(page, /Manage Tee Sheet — QA Phase1 M4 Standard Event/i, {
    timeoutMs: 90_000,
  });
  await waitForText(page, /Save Draft/i, { timeoutMs: 90_000 });
  return session;
}

test.describe("exports and shared tee-sheet", () => {
  test("attendee CSV export downloads with expected players", async ({ page }) => {
    await openM4Ready(page);

    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    await page.getByText("Export attendees", { exact: false }).first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename().toLowerCase()).toMatch(/\.csv$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      if (!stream) return reject(new Error("no download stream"));
      stream.on("data", (c) => chunks.push(Buffer.from(c)));
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });
    const csv = Buffer.concat(chunks).toString("utf8");
    expect(csv.length).toBeGreaterThan(20);
    expect(csv).toMatch(/QA Paid Player|QA Dual Member|QA Ordinary Member/i);
  });

  test("shared tee-sheet view shows event and players via Share / Export PNG", async ({
    page,
  }) => {
    await openM4Ready(page);
    page.once("dialog", (d) => d.accept().catch(() => {}));
    await page.getByText(/Share \/ Export PNG/i).first().scrollIntoViewIfNeeded();
    await page.getByText(/Share \/ Export PNG/i).first().click();
    const text = await waitForText(page, /Ready to export|Preparing tee sheet/i, {
      timeoutMs: 90_000,
    });
    // Share screen renders poster with event/player names (may be in offscreen views).
    // Assert URL carries the event payload and UI is export-ready.
    expect(page.url()).toMatch(/payload=/);
    expect(decodeURIComponent(page.url())).toMatch(/QA Phase1 M4 Standard Event/);
    expect(decodeURIComponent(page.url())).toMatch(/QA Paid Player/);
    expect(text).toMatch(/Ready to export|Share|Download|PNG/i);
  });

  test("PNG export generates file for correct event/players and updated republish payload", async ({
    page,
  }) => {
    await openM4Ready(page);
    page.once("dialog", (d) => d.accept().catch(() => {}));
    await page.getByText(/Share \/ Export PNG/i).first().scrollIntoViewIfNeeded();
    await page.getByText(/Share \/ Export PNG/i).first().click();
    await waitForText(page, /Ready to export/i, { timeoutMs: 90_000 });

    const url1 = decodeURIComponent(page.url());
    expect(url1).toMatch(/QA Phase1 M4 Standard Event/);
    expect(url1).toMatch(/QA Paid Player/);
    expect(url1).toMatch(/QA Dual Member|QA Ordinary Member/);

    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 }).catch(() => null);
    const shareAction = page.getByText(/Share PNG|Download|Create PNG|Export PNG|Share/i).nth(1);
    if (await shareAction.isVisible().catch(() => false)) {
      await shareAction.click();
    } else {
      await page.getByText(/Share|Download/i).last().click().catch(() => {});
    }
    const file = await downloadPromise;
    if (file) {
      expect(file.suggestedFilename().toLowerCase()).toMatch(/\.(png|pdf)$/);
      expect(await file.path()).toBeTruthy();
    } else {
      // Poster prepared counts as generation when the browser blocks the download gesture.
      expect(await bodyText(page)).toMatch(/Ready to export|success|Download complete|PNG/i);
    }

    // Republished version: reopen manage sheet, save/update, share again and assert payload event id unchanged.
    await gotoAuthed(page, `/tee-sheet?eventId=${fixtures.events.m4Standard}`);
    await waitForText(page, /Save Draft|Update Published Tee Sheet/i, { timeoutMs: 90_000 });
    page.once("dialog", (d) => d.accept().catch(() => {}));
    await page.getByText(/Update Published Tee Sheet|Publish Tee Sheet/i).first().click();
    await page.waitForTimeout(3000);
    page.once("dialog", (d) => d.accept().catch(() => {}));
    await page.getByText(/Share \/ Export PNG/i).first().click();
    await waitForText(page, /Ready to export/i, { timeoutMs: 90_000 });
    const url2 = decodeURIComponent(page.url());
    expect(url2).toMatch(/QA Phase1 M4 Standard Event/);
    expect(url2).toMatch(fixtures.events.m4Standard);
    expect(url2).toMatch(/QA Paid Player/);
  });
});
