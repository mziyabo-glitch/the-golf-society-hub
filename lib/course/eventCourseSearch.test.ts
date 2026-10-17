import { describe, expect, it } from "vitest";
import { mergeEventCourseSearchHits } from "@/lib/course/eventCourseSearchMerge";

describe("mergeEventCourseSearchHits", () => {
  it("includes DB Vale courses and drops duplicate API hits with the same normalized name", () => {
    const merged = mergeEventCourseSearchHits(
      [{ id: "db-wales", name: "Vale Resort – Wales National Course", location: "Wales" }],
      [
        { id: 99, name: "The Vale Resort - Wales National Course", club_name: "The Vale Resort - Wales National Course" },
        { id: 100, name: "Other Club", club_name: "Other Club" },
      ],
    );

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ source: "db", courseId: "db-wales" });
    expect(merged[1]).toMatchObject({ source: "api", apiId: 100 });
  });
});
