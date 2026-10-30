import { describe, expect, it, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

describe("getJointEventRegistrations RPC fallback", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
  });

  it("awaits society-scoped fallback when RPC fails (no Promise leak)", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "missing function" } });

    const queryResult = {
      data: [
        {
          id: "r1",
          society_id: "s1",
          event_id: "ev1",
          member_id: "m1",
          status: "in",
          paid: true,
          amount_paid_pence: 0,
          paid_at: null,
          marked_by_member_id: null,
          created_at: "",
          updated_at: "",
        },
      ],
      error: null,
    };
    const chain: Record<string, unknown> = {};
    const self = () => chain as typeof chain & PromiseLike<typeof queryResult>;
    chain.select = vi.fn(self);
    chain.eq = vi.fn(self);
    chain.order = vi.fn(self);
    chain.is = vi.fn(self);
    chain.then = (onFulfilled: (v: typeof queryResult) => unknown) =>
      Promise.resolve(queryResult).then(onFulfilled);
    fromMock.mockReturnValue(chain);

    const { getJointEventRegistrations } = await import("./eventRegistrationRepo");
    const rows = await getJointEventRegistrations("ev1");
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0].member_id).toBe("m1");
  });
});
