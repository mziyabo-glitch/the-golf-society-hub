/**
 * User-facing copy when calendar token / table operations fail.
 */

export function explainCalendarFeedRpcError(err: unknown, fallback: string): string {
  const any = err as { message?: string; code?: string; details?: string };
  const msg = [any.message, any.details].filter(Boolean).join(" ");
  const code = String(any.code ?? "");

  const looksMissingRpc =
    /\b404\b/.test(msg) ||
    /function .* does not exist/i.test(msg) ||
    /could not find the function/i.test(msg) ||
    /schema cache/i.test(msg) ||
    code === "PGRST202" ||
    code === "PGRST301";

  const looksMissingTable =
    /relation ["']?public\.calendar_feed_tokens["']? does not exist/i.test(msg) ||
    /calendar_feed_tokens.*does not exist/i.test(msg) ||
    code === "42P01";

  if (looksMissingTable || looksMissingRpc) {
    return (
      "The calendar database objects are not installed on this Supabase project. " +
      "Open Supabase → SQL Editor for the same project as the app, run migration 093 (table + policies), " +
      "then reload. RPCs are optional; the app uses the table directly."
    );
  }

  const trimmed = msg.trim();
  return trimmed || fallback;
}
