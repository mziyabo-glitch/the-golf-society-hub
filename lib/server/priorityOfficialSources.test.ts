import { mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildOfficialDiscoveryQueries,
  evaluateIdentitySanity,
  isPriorityCourseName,
  loadPriorityCourseEntriesFromConfig,
  normalizeCourseKey,
  parseHtmlScorecard,
  parseStructuredScorecardText,
  type PriorityCourseEntry,
} from "@/lib/server/priorityOfficialSources";

describe("priorityOfficialSources", () => {
  it("builds deterministic official discovery queries", () => {
    const queries = buildOfficialDiscoveryQueries("Upavon Golf Club");
    expect(queries).toEqual([
      "Upavon Golf Club scorecard pdf",
      "Upavon Golf Club hole by hole",
      "Upavon Golf Club golf scorecard",
      "Upavon Golf Club tee yardage stroke index",
      "Upavon Golf Club England Golf",
      "Upavon Golf Club R&A",
    ]);
  });

  it("normalizes course keys for priority matching", () => {
    expect(normalizeCourseKey(" The Vale Resort - Lake Course ")).toBe("the vale resort lake course");
  });

  it("matches priority names case-insensitively", () => {
    const hit = isPriorityCourseName("upavon golf club", [{ name: "Upavon Golf Club" }]);
    expect(hit).toBe(true);
  });

  it("parses structured scorecard text blocks", () => {
    const text = `
      Tee: White
      1 4 390 11
      2 3 170 15
      Tee: Yellow
      1 4 370 11
      2 3 160 15
    `;
    const tees = parseStructuredScorecardText(text);
    expect(tees).toHaveLength(2);
    expect(tees[0]?.holes[0]).toEqual({
      hole_number: 1,
      par: 4,
      yardage: 390,
      stroke_index: 11,
    });
  });

  it("parses html scorecard tables", () => {
    const html = `
      <table data-tee-name="White">
        <tr><th>Hole</th><th>Par</th><th>Yardage</th><th>Stroke Index</th></tr>
        <tr><td>1</td><td>4</td><td>398</td><td>9</td></tr>
        <tr><td>2</td><td>5</td><td>512</td><td>3</td></tr>
      </table>
    `;
    const tees = parseHtmlScorecard(html);
    expect(tees).toHaveLength(1);
    expect(tees[0]?.teeName).toBe("White");
    expect(tees[0]?.holes[1]?.yardage).toBe(512);
  });

  it("loads priority override fields from JSON config", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "priority-course-config-"));
    const jsonPath = path.join(dir, "priority.json");
    await writeFile(
      jsonPath,
      JSON.stringify({
        courses: [
          {
            courseName: "The Vale Resort",
            officialScorecardUrl: "https://example.com/vale-scorecard.pdf",
            sourceType: "pdf",
            notes: "official pdf override",
          },
        ],
      }),
      "utf8",
    );
    const prev = process.env.COURSE_IMPORT_PRIORITY_COURSES_JSON;
    process.env.COURSE_IMPORT_PRIORITY_COURSES_JSON = jsonPath;
    try {
      const rows = await loadPriorityCourseEntriesFromConfig();
      const vale = rows.find((r) => r.name === "The Vale Resort");
      expect(vale?.officialScorecardUrl).toBe("https://example.com/vale-scorecard.pdf");
      expect(vale?.sourceType).toBe("pdf");
    } finally {
      if (prev == null) delete process.env.COURSE_IMPORT_PRIORITY_COURSES_JSON;
      else process.env.COURSE_IMPORT_PRIORITY_COURSES_JSON = prev;
      await rm(dir, { recursive: true, force: true });
    }
  });

  describe("evaluateIdentitySanity", () => {
    const valeEntries: PriorityCourseEntry[] = [
      {
        name: "The Vale Resort",
        subCourseName: "Wales National Course",
        courseAlias: ["The Wales National Course", "Wales National"],
        expectedIdentityTerms: ["Vale Resort", "Wales National", "Hensol", "Vale of Glamorgan", "Wales"],
        excludedIdentityTerms: ["Union Vale", "Links At Union Vale"],
        expectedCountry: "Wales",
        expectedRegion: "Vale of Glamorgan",
      },
      {
        name: "The Vale Resort",
        subCourseName: "Lake Course",
        courseAlias: ["The Lake Course", "Lake"],
        expectedIdentityTerms: ["Vale Resort", "Lake Course", "Hensol", "Vale of Glamorgan", "Wales"],
        excludedIdentityTerms: ["Union Vale", "Links At Union Vale"],
        expectedCountry: "Wales",
        expectedRegion: "Vale of Glamorgan",
      },
    ];

    it("rejects api identity that matches an excluded term", () => {
      const result = evaluateIdentitySanity({
        courseName: "The Vale Resort",
        entries: valeEntries,
        apiCourseIdentityName: "The Links At Union Vale",
        apiCountry: "United States",
        apiRegion: "New York",
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("identity_excluded_term_hit");
      expect(result.excludedTermHit).toMatch(/Union Vale|Links At Union Vale/);
    });

    it("passes api identity that matches expected vale resort terms", () => {
      const result = evaluateIdentitySanity({
        courseName: "The Vale Resort",
        entries: valeEntries,
        apiCourseIdentityName: "The Vale Resort - Wales National Course",
        apiCountry: "Wales",
        apiRegion: "Vale of Glamorgan",
      });
      expect(result.ok).toBe(true);
      expect(result.reason).toBe("identity_matched");
      expect(result.matchedTerms.some((t) => /Vale Resort/i.test(t))).toBe(true);
    });

    it("fails if api identity has none of the expected terms and identity is present", () => {
      const result = evaluateIdentitySanity({
        courseName: "The Vale Resort",
        entries: valeEntries,
        apiCourseIdentityName: "Some Unrelated Course",
        apiCountry: "Germany",
        apiRegion: "Bavaria",
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("identity_missing_terms");
      expect(result.missingTerms.length).toBeGreaterThan(0);
    });

    it("passes with no_constraints when no identity terms are configured", () => {
      const result = evaluateIdentitySanity({
        courseName: "Somewhere",
        entries: [{ name: "Somewhere" }],
        apiCourseIdentityName: "Somewhere Else",
      });
      expect(result.ok).toBe(true);
      expect(result.reason).toBe("no_constraints");
    });
  });
});
