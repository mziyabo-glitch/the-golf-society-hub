import { supabase } from "@/lib/supabase";

export type PaymentTransactionRow = {
  id: string;
  society_id: string;
  beneficiary_society_id: string;
  event_id: string;
  payer_type: "member" | "guest";
  member_id: string | null;
  guest_id: string | null;
  amount_pence: number;
  processing_fee_mode?: "society_absorbs" | "player_pays" | null;
  intended_fee_pence?: number | null;
  estimated_processing_fee_pence?: number | null;
  stripe_processing_fee_pence?: number | null;
  stripe_net_pence?: number | null;
  processing_fee_variance_pence?: number | null;
  currency: string;
  status: "pending" | "succeeded" | "failed" | "canceled" | "refunded" | "refund_pending";
  stripe_refund_status?: "pending" | "succeeded" | "failed" | null;
  payment_method: "stripe" | "manual" | "bank_transfer";
  stripe_checkout_session_id: string | null;
  stripe_receipt_url: string | null;
  payer_display_name: string | null;
  event_name: string | null;
  resolution_required: boolean;
  completed_at: string | null;
  created_at: string;
};

export async function getRecentPaymentTransactionsForSociety(
  societyId: string,
  limit = 50,
): Promise<PaymentTransactionRow[]> {
  if (!societyId?.trim()) return [];
  const { data, error } = await supabase
    .from("payment_transactions")
    .select(
      "id, society_id, beneficiary_society_id, event_id, payer_type, member_id, guest_id, amount_pence, processing_fee_mode, intended_fee_pence, estimated_processing_fee_pence, stripe_processing_fee_pence, stripe_net_pence, processing_fee_variance_pence, currency, status, payment_method, stripe_checkout_session_id, stripe_receipt_url, payer_display_name, event_name, resolution_required, completed_at, created_at",
    )
    .eq("society_id", societyId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[paymentTransactionRepo]", error.message);
    return [];
  }
  return (data ?? []) as PaymentTransactionRow[];
}
