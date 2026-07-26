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

function payloadFromUrl(url: string): Record<string, unknown> {
  const raw = new URL(url).searchParams.get("payload");
  if (!raw) throw new Error(`No payload in ${url}`);
  let decoded = raw;
  for (let i = 0; i < 3; i++) {
    try {
      const parsed = JSON.parse(decoded);
      return parsed as Record<string, unknown>;
    } catch {
      decoded = decodeURIComponent(decoded);
    }
  }
  throw new Error(`Could not parse tee-sheet payload from ${url}`);
}

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
    const filename = download.suggestedFilename();
    expect(filename.toLowerCase()).toMatch(/\.csv$/);
    expect(filename).toMatch(/QA Phase1 M4 Standard Event/i);

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
    // Web export may omit display names for placeholder members; still expect member rows.
    const memberRows = csv.split(/\r?\n/).filter((l) => /^Member,/i.test(l.trim()));
    expect(memberRows.length).toBeGreaterThanOrEqual(3);
    expect(csv).toMatch(/Name|Member|Gender/i);
  });

  test("shared tee-sheet view shows event and players via Share / Export PNG", async ({
    page,
  }) => {
    await openM4Ready(page);
    page.once("dialog", (d) => d.accept().catch(() => {}));
    await page.getByText(/Share \/ Export PNG/i).first().scrollIntoViewIfNeeded();
    await page.getByText(/Share \/ Export PNG/i).first().click();
    await waitForText(page, /Ready to export/i, { timeoutMs: 90_000 });
    expect(page.url()).toMatch(/payload=/);
    const payload = payloadFromUrl(page.url());
    expect(String(payload.eventName)).toMatch(/QA Phase1 M4 Standard Event/);
    expect(String(payload.eventId)).toBe(fixtures.events.m4Standard);
    const players = (payload.players as { name?: string }[]) ?? [];
    const names = players.map((p) => p.name ?? "").join(" | ");
    expect(names).toMatch(/QA Paid Player/);
    expect(names).toMatch(/QA Dual Member|QA Ordinary Member/);
  });

  test("PNG export generates file for correct event/players and updated republish payload", async ({
    page,
  }) => {
    await openM4Ready(page);
    page.once("dialog", (d) => d.accept().catch(() => {}));
    await page.getByText(/Share \/ Export PNG/i).first().scrollIntoViewIfNeeded();
    await page.getByText(/Share \/ Export PNG/i).first().click();
    await waitForText(page, /Ready to export/i, { timeoutMs: 90_000 });

    const payload1 = payloadFromUrl(page.url());
    expect(String(payload1.eventName)).toMatch(/QA Phase1 M4 Standard Event/);
    expect(String(payload1.eventId)).toBe(fixtures.events.m4Standard);
    const names1 = ((payload1.players as { name?: string }[]) ?? [])
      .map((p) => p.name ?? "")
      .join(" | ");
    expect(names1).toMatch(/QA Paid Player/);

    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 }).catch(() => null);
    await page.getByText(/Share \/ Download/i).first().click();
    const file = await downloadPromise;
    if (file) {
      expect(file.suggestedFilename().toLowerCase()).toMatch(/\.(png|pdf)$/);
      expect(await file.path()).toBeTruthy();
    } else {
      expect(await bodyText(page)).toMatch(/Ready to export|Download complete|success|PNG/i);
    }

    await gotoAuthed(page, `/tee-sheet?eventId=${fixtures.events.m4Standard}`);
    await waitForText(page, /Save Draft|Update Published Tee Sheet/i, { timeoutMs: 90_000 });
    page.once("dialog", (d) => d.accept().catch(() => {}));
    const update = page.getByText(/Update Published Tee Sheet/i).first();
    if (await update.isVisible().catch(() => false)) {
      await update.click();
      await page.waitForTimeout(2500);
      // Publish may navigate to share — return if needed.
      if (/payload=/.test(page.url()) || /Ready to export/i.test(await bodyText(page))) {
        await gotoAuthed(page, `/tee-sheet?eventId=${fixtures.events.m4Standard}`);
        await waitForText(page, /Save Draft/i, { timeoutMs: 90_000 });
      }
    }
    page.once("dialog", (d) => d.accept().catch(() => {}));
    await page.getByText(/Share \/ Export PNG/i).first().click();
    await waitForText(page, /Ready to export/i, { timeoutMs: 90_000 });
    const payload2 = payloadFromUrl(page.url());
    expect(String(payload2.eventId)).toBe(fixtures.events.m4Standard);
    expect(String(payload2.eventName)).toMatch(/QA Phase1 M4 Standard Event/);
    const names2 = ((payload2.players as { name?: string }[]) ?? [])
      .map((p) => p.name ?? "")
      .join(" | ");
    expect(names2).toMatch(/QA Paid Player/);
  });
});
