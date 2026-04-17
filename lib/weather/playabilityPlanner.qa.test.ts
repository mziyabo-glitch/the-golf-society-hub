import { describe, expect, it } from "vitest";
import type { PlayabilityMetrics, PlayabilityStatus } from "@/lib/weather/playabilityEngine";
import type { PlannerWindowEvaluation } from "@/lib/weather/playabilityPlanner";
import {
  formatDashboardBestNextSlot,
  plannerBuildSummaryForTest,
  plannerClassifyDayKindForTest,
  type FiveDayPlayabilityPlan,
} from "@/lib/weather/playabilityPlanner";
import { formatFiveDayWeekOutlookLine } from "@/lib/weather/playabilityPlannerPresentation";
import type { DailySummaryKind } from "@/lib/weather/playabilityPlannerPresentation";

const emptyMetrics: PlayabilityMetrics = {
  windKmh: null,
  gustKmh: null,
  rainMmPerH: null,
  rainProbabilityPct: null,
  tempC: null,
  feelsLikeC: null,
  windChillC: null,
};

function win(
  label: string,
  startHour: number,
  endHour: number,
  status: PlayabilityStatus,
  score: number | null,
): PlannerWindowEvaluation {
  return {
    label,
    startHour,
    endHour,
    status,
    score,
    message: "",
    reasons: [],
    metrics: { ...emptyMetrics },
  };
}

describe("plannerClassifyDayKindForTest (UK-style scenarios)", () => {
  it("GOOD_DAY when two clean PLAY windows", () => {
    const windows = [
      win("06:00–10:00", 6, 10, "PLAY", 78),
      win("10:00–14:00", 10, 14, "PLAY", 80),
      win("14:00–18:00", 14, 18, "MARGINAL", 62),
    ];
    expect(plannerClassifyDayKindForTest(windows)).toBe("GOOD_DAY");
  });

  it("NARROW_WINDOW when one window clearly stronger", () => {
    const windows = [
      win("06:00–10:00", 6, 10, "MARGINAL", 55),
      win("10:00–14:00", 10, 14, "PLAY", 76),
      win("14:00–18:00", 14, 18, "MARGINAL", 54),
    ];
    expect(plannerClassifyDayKindForTest(windows)).toBe("NARROW_WINDOW");
  });

  it("PLAYABLE_WITH_CAUTION when all marginal but decent scores (drizzle-all-day feel)", () => {
    const windows = [
      win("06:00–10:00", 6, 10, "MARGINAL", 58),
      win("10:00–14:00", 10, 14, "MARGINAL", 56),
      win("14:00–18:00", 14, 18, "MARGINAL", 55),
    ];
    expect(plannerClassifyDayKindForTest(windows)).toBe("PLAYABLE_WITH_CAUTION");
  });

  it("POOR_DAY when any NO_PLAY", () => {
    const windows = [
      win("06:00–10:00", 6, 10, "PLAY", 70),
      win("10:00–14:00", 10, 14, "NO_PLAY", 20),
      win("14:00–18:00", 14, 18, "MARGINAL", 50),
    ];
    expect(plannerClassifyDayKindForTest(windows)).toBe("POOR_DAY");
  });

  it("POOR_DAY when all UNKNOWN", () => {
    const windows = [
      win("06:00–10:00", 6, 10, "UNKNOWN", null),
      win("10:00–14:00", 10, 14, "UNKNOWN", null),
      win("14:00–18:00", 14, 18, "UNKNOWN", null),
    ];
    expect(plannerClassifyDayKindForTest(windows)).toBe("POOR_DAY");
  });

  it("GOOD_DAY when breezy but dry (all PLAY)", () => {
    const windows = [
      win("06:00–10:00", 6, 10, "PLAY", 74),
      win("10:00–14:00", 10, 14, "PLAY", 72),
      win("14:00–18:00", 14, 18, "PLAY", 70),
    ];
    expect(plannerClassifyDayKindForTest(windows)).toBe("GOOD_DAY");
  });

  it("PLAYABLE_WITH_CAUTION when gusts spike one window only", () => {
    const windows = [
      win("06:00–10:00", 6, 10, "PLAY", 76),
      win("10:00–14:00", 10, 14, "CAUTION", 58),
      win("14:00–18:00", 14, 18, "PLAY", 74),
    ];
    expect(plannerClassifyDayKindForTest(windows)).toBe("PLAYABLE_WITH_CAUTION");
  });

  it("POOR_DAY when every window is a washout", () => {
    const windows = [
      win("06:00–10:00", 6, 10, "NO_PLAY", 22),
      win("10:00–14:00", 10, 14, "NO_PLAY", 18),
      win("14:00–18:00", 14, 18, "NO_PLAY", 20),
    ];
    expect(plannerClassifyDayKindForTest(windows)).toBe("POOR_DAY");
  });
});

describe("formatFiveDayWeekOutlookLine", () => {
  it("reads a poor week when most days are POOR_DAY", () => {
    const kinds: DailySummaryKind[] = ["POOR_DAY", "POOR_DAY", "POOR_DAY", "POOR_DAY", "GOOD_DAY"];
    const line = formatFiveDayWeekOutlookLine(kinds.map((dailySummaryKind) => ({ dailySummaryKind })));
    expect(line).toMatch(/Poor golfing week/i);
  });

  it("reads a strong stretch when several days are GOOD_DAY", () => {
    const kinds: DailySummaryKind[] = ["GOOD_DAY", "GOOD_DAY", "GOOD_DAY", "PLAYABLE_WITH_CAUTION", "POOR_DAY"];
    const line = formatFiveDayWeekOutlookLine(kinds.map((dailySummaryKind) => ({ dailySummaryKind })));
    expect(line).toMatch(/Strong golfing stretch/i);
  });

  it("reads narrow windows when multiple NARROW_WINDOW days", () => {
    const kinds: DailySummaryKind[] = ["NARROW_WINDOW", "NARROW_WINDOW", "POOR_DAY", "POOR_DAY", "GOOD_DAY"];
    const line = formatFiveDayWeekOutlookLine(kinds.map((dailySummaryKind) => ({ dailySummaryKind })));
    expect(line).toMatch(/Narrow weather windows/i);
  });
});

describe("formatDashboardBestNextSlot", () => {
  it("returns a headline when a window clears the score bar", () => {
    const plan: FiveDayPlayabilityPlan = {
      startDateYmd: "2026-01-01",
      days: [
        {
          date: "2026-01-01",
          dayLabel: "Thu 1 Jan",
          overallStatus: "PLAY",
          overallScore: 80,
          dailySummaryKind: "GOOD_DAY",
          summaryMessage: "",
          bestWindow: "10:00–14:00",
          bestWindowIsClear: true,
          windows: [
            win("06:00–10:00", 6, 10, "MARGINAL", 60),
            win("10:00–14:00", 10, 14, "PLAY", 78),
            win("14:00–18:00", 14, 18, "MARGINAL", 58),
          ],
        },
      ],
    };
    const line = formatDashboardBestNextSlot(plan);
    expect(line).toContain("Best next slot");
    expect(line).toContain("10:00–14:00");
  });

  it("returns null when nothing reaches the headline bar", () => {
    const plan: FiveDayPlayabilityPlan = {
      startDateYmd: "2026-01-01",
      days: [
        {
          date: "2026-01-01",
          dayLabel: "Thu 1 Jan",
          overallStatus: "MARGINAL",
          overallScore: 55,
          dailySummaryKind: "PLAYABLE_WITH_CAUTION",
          summaryMessage: "",
          bestWindow: "10:00–14:00",
          bestWindowIsClear: false,
          windows: [
            win("06:00–10:00", 6, 10, "MARGINAL", 58),
            win("10:00–14:00", 10, 14, "MARGINAL", 56),
            win("14:00–18:00", 14, 18, "MARGINAL", 55),
          ],
        },
      ],
    };
    expect(formatDashboardBestNextSlot(plan)).toBeNull();
  });
});

describe("plannerBuildSummaryForTest", () => {
  it("avoids over-specific best-window wording when best is not clear", () => {
    const windows = [
      win("06:00–10:00", 6, 10, "PLAY", 70),
      win("10:00–14:00", 10, 14, "PLAY", 71),
      win("14:00–18:00", 14, 18, "PLAY", 69),
    ];
    const msg = plannerBuildSummaryForTest("GOOD_DAY", "10:00–14:00", windows, false);
    expect(msg).toContain("10:00–14:00");
    expect(msg).not.toContain("pick of the bunch");
  });

  it("uses firmer best-window line when clear", () => {
    const windows = [
      win("06:00–10:00", 6, 10, "MARGINAL", 55),
      win("10:00–14:00", 10, 14, "PLAY", 82),
      win("14:00–18:00", 14, 18, "MARGINAL", 52),
    ];
    const msg = plannerBuildSummaryForTest("GOOD_DAY", "10:00–14:00", windows, true);
    expect(msg).toContain("pick of the bunch");
  });
});
