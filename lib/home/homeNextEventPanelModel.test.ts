import { describe, expect, it } from "vitest";
import {
  hasBillableEventFee,
  homeEventPrimaryCtaLabel,
  resolveHomePlayingStatus,
  shouldShowHomePaymentRow,
} from "./homeNextEventPanelModel";

describe("homeNextEventPanelModel", () => {
  describe("hasBillableEventFee", () => {
    it("treats empty and zero-like fees as non-billable", () => {
      expect(hasBillableEventFee(null)).toBe(false);
      expect(hasBillableEventFee("")).toBe(false);
      expect(hasBillableEventFee("Not set")).toBe(false);
      expect(hasBillableEventFee("£0")).toBe(false);
      expect(hasBillableEventFee("free")).toBe(false);
    });
    it("treats positive display fees as billable", () => {
      expect(hasBillableEventFee("£45")).toBe(true);
      expect(hasBillableEventFee("45 GBP")).toBe(true);
    });
  });

  describe("resolveHomePlayingStatus", () => {
    it("distinguishes in, out, and no registration", () => {
      expect(resolveHomePlayingStatus({ status: "in", paid: false } as any).label).toBe("Playing");
      expect(resolveHomePlayingStatus({ status: "out", paid: false } as any).label).toBe("Not playing");
      expect(resolveHomePlayingStatus(null).label).toBe("No response");
    });
  });

  describe("shouldShowHomePaymentRow", () => {
    it("hides payment UI when not playing even if fee exists", () => {
      expect(shouldShowHomePaymentRow(null, "£40")).toBe(false);
      expect(shouldShowHomePaymentRow({ status: "out", paid: false } as any, "£40")).toBe(false);
    });
    it("shows payment UI only for playing members with billable fee", () => {
      expect(shouldShowHomePaymentRow({ status: "in", paid: false } as any, "£40")).toBe(true);
      expect(shouldShowHomePaymentRow({ status: "in", paid: false } as any, "£0")).toBe(false);
    });
  });

  describe("homeEventPrimaryCtaLabel", () => {
    it("uses one CTA label based on manage permission", () => {
      expect(homeEventPrimaryCtaLabel(false)).toBe("View event");
      expect(homeEventPrimaryCtaLabel(true)).toBe("Manage event");
    });
  });
});
