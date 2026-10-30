import { describe, expect, it } from "vitest";
import {
  isPublishedScoringStatus,
  scoringLeaderboardStatusExplainer,
  scoringOfficialBadgeLabel,
  scoringOfficialUiKind,
} from "@/lib/scoring/scoringOfficialUi";

describe("scoringOfficialBadgeLabel", () => {
  it("labels published vs draft", () => {
    expect(scoringOfficialBadgeLabel("published")).toBe("Official");
    expect(scoringOfficialBadgeLabel("draft")).toBe("Draft");
  });
});

describe("scoringOfficialUi", () => {
  it("classifies status for UI", () => {
    expect(scoringOfficialUiKind("published")).toBe("published");
    expect(scoringOfficialUiKind("reopened")).toBe("reopened");
    expect(scoringOfficialUiKind("draft")).toBe("draft");
  });

  it("isPublishedScoringStatus", () => {
    expect(isPublishedScoringStatus("published")).toBe(true);
    expect(isPublishedScoringStatus("draft")).toBe(false);
  });

  it("explainer mentions OOM when OOM event", () => {
    const t = scoringLeaderboardStatusExplainer("draft", { isOomEvent: true, hasAnySavedRound: true });
    expect(t.toLowerCase()).toContain("oom");
  });
});
