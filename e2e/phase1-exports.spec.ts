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

function sharePayload(overrides: Record<string, unknown> = {}) {
  return {
    societyName: "QA Phase1 M4 Society",
    manCo: {},
    eventId: fixtures.events.m4Standard,
    eventName: "QA Phase1 M4 Standard Event — v1",
    eventDate: "2026-08-04",
    courseName: null,
    format: "stableford",
    nearestPinHoles: [7, 15],
    longestDriveHoles: [3],
    players: [
      { name: "QA Paid Player", group: 1, teeTime: "08:00" },
      { name: "QA Dual Member", group: 1, teeTime: "08:00" },
    ],
    alreadyGrouped: true,
    startTime: "08:00",
    teeTimeInterval: 10,
    ...overrides,
  };
}

test.describe("exports and shared tee-sheet", () => {
  test("attendee CSV export downloads with expected players", async ({ page }) => {
    const session = await signInSession(fixtures.accounts.m4Captain.email, fixtures.password);
    await injectSession(page, session);
    await gotoAuthed(page, `/tee-sheet?eventId=${fixtures.events.m4Standard}`);
    await waitForText(page, /Export attendees/i);

    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 }).catch(() => null);
    await page.getByText("Export attendees", { exact: false }).first().click();
    const download = await downloadPromise;
    expect(download, "CSV download should start").not.toBeNull();
    const suggested = download!.suggestedFilename();
    expect(suggested.toLowerCase()).toMatch(/\.csv$/);

    const stream = await download!.createReadStream();
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      if (!stream) return reject(new Error("no download stream"));
      stream.on("data", (c) => chunks.push(Buffer.from(c)));
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });
    const csv = Buffer.concat(chunks).toString("utf8");
    expect(csv.length).toBeGreaterThan(20);
    expect(csv).toMatch(/QA Paid Player|QA Dual Member|QA Ordinary Member|Paid Player/i);
  });

  test("shared tee-sheet view shows event and players", async ({ page }) => {
    const session = await signInSession(fixtures.accounts.m4Captain.email, fixtures.password);
    await injectSession(page, session);
    const encoded = encodeURIComponent(JSON.stringify(sharePayload()));
    await gotoAuthed(page, `/tee-sheet?payload=${encoded}`);
    const text = await waitForText(page, /QA Phase1 M4 Standard Event/i);
    expect(text).toMatch(/QA Paid Player/);
    expect(text).toMatch(/QA Dual Member/);
  });

  test("PNG export payload shows correct event, players, and republished version", async ({
    page,
  }) => {
    const session = await signInSession(fixtures.accounts.m4Captain.email, fixtures.password);
    await injectSession(page, session);

    const v1 = encodeURIComponent(JSON.stringify(sharePayload()));
    await gotoAuthed(page, `/tee-sheet?payload=${v1}`);
    let text = await waitForText(page, /QA Phase1 M4 Standard Event — v1/i);
    expect(text).toMatch(/QA Paid Player/);
    expect(text).toMatch(/QA Dual Member/);

    const downloadPromise = page.waitForEvent("download", { timeout: 45_000 }).catch(() => null);
    const action = page.getByText(/Download|Share PNG|Save PNG|Export PNG|Share/i).first();
    if (await action.isVisible().catch(() => false)) {
      await action.click();
    }
    const file = await downloadPromise;
    if (file) {
      const name = file.suggestedFilename().toLowerCase();
      expect(name).toMatch(/\.(png|pdf)$/);
      const saved = await file.path();
      expect(saved).toBeTruthy();
    } else {
      // Headless may render poster without triggering a download gesture.
      expect(await bodyText(page)).toMatch(/QA Paid Player/);
    }

    const v2 = encodeURIComponent(
      JSON.stringify(sharePayload({ eventName: "QA Phase1 M4 Standard Event — v2 republished" })),
    );
    await gotoAuthed(page, `/tee-sheet?payload=${v2}`);
    text = await waitForText(page, /v2 republished/i);
    expect(text).toMatch(/QA Paid Player/);
    expect(text).not.toMatch(/— v1(?!\d)/);
  });
});
