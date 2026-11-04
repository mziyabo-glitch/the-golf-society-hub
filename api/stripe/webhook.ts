import { handleStripeWebhook } from "@/lib/payments/stripeWebhookHandler";
import { stagingRefusalResponse } from "@/lib/payments/stagingGuard";

export async function POST(req: Request) {
  const refused = stagingRefusalResponse();
  if (refused) return refused;
  const rawBody = await req.text();
  const result = await handleStripeWebhook({
    rawBody,
    signatureHeader: req.headers.get("stripe-signature"),
  });
  return Response.json(result.body, { status: result.status });
}
