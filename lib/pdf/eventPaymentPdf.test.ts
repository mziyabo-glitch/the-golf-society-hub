import { describe, expect, it } from "vitest";
import { buildEventPaymentPdfHtml } from "@/lib/pdf/eventPaymentPdfHtml";

/** Parse payment export table body rows for cell-isolation assertions. */
function parsePaymentTableRows(html: string): {
  no: string;
  name: string;
  type: string;
  status: string;
}[] {
  const rowRe =
    /<tr>\s*<td class="col-no">(\d+)<\/td>\s*<td class="col-name">([^<]*)<\/td>\s*<td class="col-type">([^<]*)<\/td>\s*<td class="col-status[^"]*">([^<]*)<\/td>\s*<\/tr>/g;
  const rows: { no: string; name: string; type: string; status: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html)) !== null) {
    rows.push({ no: m[1], name: m[2], type: m[3], status: m[4] });
  }
  return rows;
}

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

  it("status cells contain only payment labels, not type/source text", () => {
    const html = buildEventPaymentPdfHtml({
      societyName: "M4 Fairway",
      logoUrl: null,
      eventName: "OOM 4 - The Millbrook",
      eventDate: "2026-06-22",
      paidNames: [],
      unpaidNames: [],
      generatedAt: "2026-06-22T12:00:00Z",
      jointThisSocietyNote: "Joint event: all participating societies are included.",
      exportRows: [
        {
          name: "Tawanda Moyo",
          typeLabel: "Zambezi Golf Society Member",
          statusLabel: "Unpaid",
        },
        {
          name: "Jade Muchando",
          typeLabel: "M4 Fairway Member",
          statusLabel: "Paid",
        },
        {
          name: "Dual Person",
          typeLabel: "Dual / registered via M4 Fairway",
          statusLabel: "Paid via M4 Fairway / Unpaid via Zambezi Golf Society",
        },
      ],
    });

    const rows = parsePaymentTableRows(html);
    expect(rows).toHaveLength(3);

    for (const row of rows) {
      expect(row.status).not.toMatch(/\bMember\b/i);
      expect(row.status).not.toMatch(/\bGuest\b/i);
      expect(row.status).not.toMatch(/registered via/i);
      expect(row.type).not.toMatch(/^Paid|^Unpaid/);
    }

    expect(rows[0].type).toBe("Zambezi Golf Society Member");
    expect(rows[0].status).toBe("Unpaid");
    expect(rows[1].status).toBe("Paid");
    expect(rows[2].status).toBe("Paid via M4 Fairway / Unpaid via Zambezi Golf Society");
  });

  it("clips type column overflow so status cells stay isolated in CSS", () => {
    const html = buildEventPaymentPdfHtml({
      societyName: "M4",
      logoUrl: null,
      eventName: "Test",
      eventDate: null,
      paidNames: [],
      unpaidNames: [],
      generatedAt: "2026-06-22T12:00:00Z",
      jointThisSocietyNote: null,
      exportRows: [{ name: "X", typeLabel: "Long Type", statusLabel: "Paid" }],
    });

    expect(html).toContain(".col-type");
    expect(html).toMatch(/\.col-type\s*\{[^}]*overflow:\s*hidden/);
    expect(html).toMatch(/\.col-status\s*\{[^}]*overflow:\s*hidden/);
    expect(html).toMatch(/\.sheet-table tbody td\s*\{[^}]*overflow:\s*hidden/);
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
