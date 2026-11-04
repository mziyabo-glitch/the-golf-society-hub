/**
 * Joint events: each society collects its own fee.
 * Checkout must not send a member or guest payment to a host or any other society.
 */
export function paymentBeneficiaryError(input: {
  payerSocietyId: string | null | undefined;
  beneficiarySocietyId: string | null | undefined;
}): string | null {
  const payer = String(input.payerSocietyId ?? "").trim();
  const beneficiary = String(input.beneficiarySocietyId ?? "").trim();
  if (!payer || !beneficiary || payer !== beneficiary) {
    return "Payments stay with the payer's own society";
  }
  return null;
}
