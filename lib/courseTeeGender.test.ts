import { describe, expect, it } from "vitest";
import type { CourseTee } from "@/lib/db_supabase/courseRepo";
import { matchMenTeeFromEvent, matchLadiesTeeFromEvent } from "@/lib/courseTeeGender";

function tee(
  id: string,
  name: string,
  overrides: Partial<CourseTee> = {},
): CourseTee {
  return {
    id,
    course_id: "course-1",
    tee_name: name,
    par_total: 71,
    course_rating: 72.0,
    slope_rating: 132,
    total_yards: 6437,
    gender: null,
    holes: [],
    ...overrides,
  } as CourseTee;
}

describe("matchMenTeeFromEvent", () => {
  const upavonTees = [
    tee("black", "Black", { course_rating: 73.4, slope_rating: 134, total_yards: 6722 }),
    tee("white", "White", { course_rating: 72.0, slope_rating: 132 }),
    tee("yellow", "Yellow", { course_rating: 70.1, slope_rating: 128, total_yards: 6032 }),
    tee("red", "Red", { course_rating: 67.6, slope_rating: 117, total_yards: 5459 }),
    tee("red-ladies", "Red (Ladies)", {
      course_rating: 76.3,
      slope_rating: 134,
      total_yards: 5459,
      gender: "F",
    }),
  ];

  it("matches men's tee by saved name when tee_id is null (stale manual CR/slope ignored)", () => {
    const match = matchMenTeeFromEvent(upavonTees, {
      teeName: "White",
      par: 71,
      courseRating: 71.8,
      slopeRating: 125,
    });
    expect(match?.id).toBe("white");
    expect(match?.course_rating).toBe(72.0);
    expect(match?.slope_rating).toBe(132);
  });

  it("does not match ladies-only tee name for men's picker", () => {
    const match = matchMenTeeFromEvent(upavonTees, { teeName: "Red (Ladies)" });
    expect(match).toBeNull();
  });

  it("matches by par/cr/slope when name is missing", () => {
    const match = matchMenTeeFromEvent(upavonTees, {
      par: 71,
      courseRating: 73.4,
      slopeRating: 134,
    });
    expect(match?.id).toBe("black");
  });
});

describe("matchLadiesTeeFromEvent", () => {
  const upavonTees = [
    tee("red", "Red", { course_rating: 67.6, slope_rating: 117 }),
    tee("red-ladies", "Red (Ladies)", { course_rating: 76.3, slope_rating: 134, gender: "F" }),
  ];

  it("matches ladies tee by saved name with stale ratings", () => {
    const match = matchLadiesTeeFromEvent(upavonTees, {
      ladiesTeeName: "Red",
      ladiesPar: 71,
      ladiesCourseRating: 72.6,
      ladiesSlopeRating: 125,
    });
    expect(match?.id).toBe("red");
  });
});
