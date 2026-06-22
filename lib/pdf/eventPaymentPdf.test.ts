import { describe, expect, it } from "vitest";
import { buildEventPaymentPdfHtml } from "@/lib/pdf/eventPaymentPdfHtml";

describe("buildEventPaymentPdfHtml", () => {
  it("joint exportRows render society type labels and inclusive footer", () => {
    const html = buildEventPaymentPdfHtml({
      societyName: "M4",
      logoUrl: null,
      eventName: "OOM 4 - The Millbrook",
      eventDate: "2026-06-22",
      paidNames: ["Brian Dube (M4 Member)"],
      unpaidNames: ["ZGS Due (ZGS Member)"],
      generatedAt: "2026-06-22T12:00:00Z",
      jointThisSocietyNote: "Joint event: all participating societies are included.",
      exportRows: [
        { name: "Brian Dube", typeLabel: "M4 Member", statusLabel: "Paid" },
        { name: "John Smith", typeLabel: "ZGS Member", statusLabel: "Paid" },
        { name: "Taka Guest", typeLabel: "ZGS Guest", statusLabel: "Paid" },
        {
          name: "Dual Member",
          typeLabel: "Dual / registered via M4",
          statusLabel: "Paid via M4 / Unpaid via ZGS",
        },
      ],
    });

    expect(html).toContain("Joint event: all participating societies are included.");
    expect(html).not.toContain("other participating societies are not listed");
    expect(html).toContain("M4 Member");
    expect(html).toContain("ZGS Guest");
    expect(html).toContain("Dual / registered via M4");
    expect(html).toContain("Paid via M4 / Unpaid via ZGS");
    expect(html).toContain("Paid 3");
    expect(html).toContain("Unpaid 1");
    expect(html).toContain("Guests 1");
  });

  it("non-joint fallback keeps generic Member/Guest type labels", () => {
    const html = buildEventPaymentPdfHtml({
      societyName: "M4",
      logoUrl: null,
      eventName: "Society Day",
      eventDate: null,
      paidNames: ["Alice"],
      unpaidNames: ["Bob (Guest)"],
      paidEntries: [{ name: "Alice", type: "member" }],
      unpaidEntries: [{ name: "Bob", type: "guest" }],
      generatedAt: "2026-06-22T12:00:00Z",
      jointThisSocietyNote: null,
    });

    expect(html).not.toContain("Joint event:");
    expect(html).toContain(">Member<");
    expect(html).toContain(">Guest<");
  });
});
