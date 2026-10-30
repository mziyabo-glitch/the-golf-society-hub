import { handleStripeWebhook } from "@/lib/payments/stripeWebhookHandler";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const result = await handleStripeWebhook({
    rawBody,
    signatureHeader: req.headers.get("stripe-signature"),
  });
  return Response.json(result.body, { status: result.status });
}
