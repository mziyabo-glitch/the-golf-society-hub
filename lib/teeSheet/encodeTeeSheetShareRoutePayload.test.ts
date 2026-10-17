import { describe, expect, it } from "vitest";
import { encodeTeeSheetShareRoutePayload } from "./encodeTeeSheetShareRoutePayload";

describe("encodeTeeSheetShareRoutePayload", () => {
  it("round-trips event name in share route param", () => {
    const encoded = encodeTeeSheetShareRoutePayload({
      societyName: "S",
      manCo: { captain: null, secretary: null, treasurer: null, handicapper: null },
      eventName: "Spring Medal",
      eventDate: null,
      courseName: null,
      format: null,
      players: [],
      preGrouped: true,
    });
    expect(decodeURIComponent(encoded)).toContain('"eventName":"Spring Medal"');
  });
});
