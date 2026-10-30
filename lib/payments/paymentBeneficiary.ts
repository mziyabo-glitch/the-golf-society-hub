/** Societies allowed to receive a joint-event Checkout payout. */
export function paymentBeneficiaryError(input: {
  beneficiarySocietyId: string | null | undefined;
  hostSocietyId: string | null | undefined;
  participatingSocietyIds: readonly string[] | null | undefined;
}): string | null {
  const beneficiary = String(input.beneficiarySocietyId ?? "").trim();
  const host = String(input.hostSocietyId ?? "").trim();
  if (!beneficiary || !host) return "Payment beneficiary is not part of this event";
  const approved = new Set<string>([host]);
  for (const id of input.participatingSocietyIds ?? []) {
    const societyId = String(id ?? "").trim();
    if (societyId) approved.add(societyId);
  }
  if (!approved.has(beneficiary)) return "Payment beneficiary is not part of this event";
  return null;
}
