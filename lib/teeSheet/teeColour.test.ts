import { describe, expect, it } from "vitest";
import {
  formatTeeRowLabel,
  teeColourFromName,
  teeColourKeyFromName,
  teeLegendLine,
} from "@/lib/teeSheet/teeColour";

describe("teeColour", () => {
  it("resolves Millbrook men tee White with outline", () => {
    const colour = teeColourFromName("White");
    expect(teeColourKeyFromName("White")).toBe("white");
    expect(colour.color).toBe("#FFFFFF");
    expect(colour.outline).toBe(true);
    expect(formatTeeRowLabel("White")).toBe("⚪ White");
  });

  it("supports standard tee colour names", () => {
    expect(teeColourFromName("Yellow").color).toBe("#E0B100");
    expect(teeColourFromName("Blue").color).toBe("#2563EB");
    expect(teeColourFromName("Black").color).toBe("#111827");
    expect(teeColourFromName("Gold").color).toBe("#C6A663");
    expect(teeColourFromName("Green").color).toBe("#16A34A");
    expect(teeColourFromName("Orange").color).toBe("#EA580C");
    expect(teeColourFromName("Red").color).toBe("#C1121F");
  });

  it("builds legend from event tee names", () => {
    expect(teeLegendLine("White", "Red")).toBe("Tee colours: White = Men, Red = Ladies");
  });
});
