import { handleCreateGuestCheckoutSession } from "@/lib/payments/guestCheckout";
import { stagingRefusalResponse } from "@/lib/payments/stagingGuard";

export async function POST(req: Request) {
  const refused = stagingRefusalResponse();
  if (refused) return refused;
  let rawBody: unknown = {};
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await handleCreateGuestCheckoutSession({
    idempotencyKey: req.headers.get("idempotency-key"),
    rawBody,
  });

  return Response.json(result.body, { status: result.status });
}
