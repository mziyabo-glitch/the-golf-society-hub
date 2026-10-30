import { handleConnectOnboarding } from "@/lib/payments/connectOnboarding";

export async function POST(req: Request) {
  let rawBody: unknown = {};
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const result = await handleConnectOnboarding({
    authorizationHeader: req.headers.get("authorization"),
    rawBody,
  });
  return Response.json(result.body, { status: result.status });
}
