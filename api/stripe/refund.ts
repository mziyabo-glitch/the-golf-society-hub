import { handleRefundEventPayment } from "@/lib/payments/refundEventPayment";

export async function POST(req: Request) {
  let rawBody: unknown = {};
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const result = await handleRefundEventPayment({
    authorizationHeader: req.headers.get("authorization"),
    idempotencyKey: req.headers.get("idempotency-key"),
    rawBody,
  });
  return Response.json(result.body, { status: result.status });
}
