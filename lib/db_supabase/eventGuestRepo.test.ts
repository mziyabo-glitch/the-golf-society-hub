import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: vi.fn(),
  },
}));

import { removeEventGuestFromEvent } from "@/lib/db_supabase/eventGuestRepo";

describe("removeEventGuestFromEvent", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("calls remove_event_guest RPC with scoped ids", async () => {
    rpcMock.mockResolvedValue({ error: null });

    await removeEventGuestFromEvent({
      eventId: "evt-1",
      societyId: "soc-1",
      guestId: "guest-1",
    });

    expect(rpcMock).toHaveBeenCalledWith("remove_event_guest", {
      p_event_id: "evt-1",
      p_society_id: "soc-1",
      p_target_guest_id: "guest-1",
    });
  });

  it("throws a migration hint when RPC is missing", async () => {
    rpcMock.mockResolvedValue({
      error: { message: "function public.remove_event_guest(uuid, uuid, uuid) does not exist" },
    });

    await expect(
      removeEventGuestFromEvent({ eventId: "e", societyId: "s", guestId: "g" }),
    ).rejects.toThrow(/20260622120000_remove_event_guest_rpc/);
  });

  it("surfaces server error messages", async () => {
    rpcMock.mockResolvedValue({
      error: { message: "Guest belongs to another society — switch the active society to remove them." },
    });

    await expect(
      removeEventGuestFromEvent({ eventId: "e", societyId: "s", guestId: "g" }),
    ).rejects.toThrow(/another society/);
  });
});
