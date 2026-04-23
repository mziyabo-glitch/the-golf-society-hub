import { describe, expect, it } from "vitest";
import {
  buildOfficialDiscoveryQueries,
  isPriorityCourseName,
  normalizeCourseKey,
  parseHtmlScorecard,
  parseStructuredScorecardText,
} from "@/lib/server/priorityOfficialSources";

describe("priorityOfficialSources", () => {
  it("builds deterministic official discovery queries", () => {
    const queries = buildOfficialDiscoveryQueries("Upavon Golf Club");
    expect(queries).toEqual([
      "Upavon Golf Club scorecard pdf",
      "Upavon Golf Club hole by hole",
      "Upavon Golf Club golf scorecard",
      "Upavon Golf Club tee yardage stroke index",
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
});
