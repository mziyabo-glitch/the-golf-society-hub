import { describe, expect, it } from "vitest";
import {
  jointPersonNameTokenKey,
  jointPersonNamesEquivalent,
} from "@/lib/jointPersonNameMatch";

describe("jointPersonNamesEquivalent", () => {
  it("matches token reorder (tee sheet surname-first)", () => {
    expect(jointPersonNamesEquivalent("Farai Gorejena", "Gorejena Farai")).toBe(true);
    expect(jointPersonNameTokenKey("Farai Gorejena")).toBe("farai gorejena");
  });

  it("matches Augustine Gorejena with Gorejena Farai (GameBook vs tee sheet)", () => {
    expect(jointPersonNamesEquivalent("Augustine Gorejena", "Gorejena Farai")).toBe(true);
    expect(jointPersonNamesEquivalent("Augustine Gorejena", "Farai Gorejena")).toBe(true);
  });

  it("does not match unrelated players", () => {
    expect(jointPersonNamesEquivalent("Terence Mokom", "Augustine Gorejena")).toBe(false);
  });
});
