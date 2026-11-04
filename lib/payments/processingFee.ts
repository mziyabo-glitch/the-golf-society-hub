/**
 * Card processing fees for online event payments.
 *
 * Stripe UK standard consumer-card pricing is the default schedule:
 * 1.5% + 20 pence. Change the quote for future payments only by editing
 * `DEFAULT_PROCESSING_FEE_SCHEDULE` in this file. A payment stores the mode
 * and the estimated line it was given; a later edit does not rewrite that row.
 *
 * Society absorbs (default): Checkout charges the event fee exactly.
 * Player pays: Checkout adds a processing-fee line so the gross is
 *   charged = ceil((intended_pence + fixed_pence) / (1 - rate))
 * where rate = basis_points / 10000. The ceiling is integer pence, so the
 * society is not short when Stripe charges exactly that schedule.
 *
 * The ledger fee is the Stripe balance transaction fee. The estimate is never
 * copied into that column. Player-pays variance is actual fee minus the
 * estimated line, in pence, and may be negative.
 */

export const STRIPE_UK_CARD_FEE_BASIS_POINTS = 150;
export const STRIPE_UK_CARD_FEE_FIXED_PENCE = 20;

export type ProcessingFeeMode = "society_absorbs" | "player_pays";

export type ProcessingFeeSchedule = {
  basisPoints: number;
  fixedPence: number;
};

export const DEFAULT_PROCESSING_FEE_SCHEDULE: ProcessingFeeSchedule = {
  basisPoints: STRIPE_UK_CARD_FEE_BASIS_POINTS,
  fixedPence: STRIPE_UK_CARD_FEE_FIXED_PENCE,
};

export const DEFAULT_PROCESSING_FEE_MODE: ProcessingFeeMode = "society_absorbs";

export type CheckoutChargeQuote = {
  mode: ProcessingFeeMode;
  intendedPence: number;
  estimatedProcessingFeePence: number;
  grossPence: number;
  basisPoints: number;
  fixedPence: number;
};

export function normalizeProcessingFeeMode(value: string | null | undefined): ProcessingFeeMode {
  return value === "player_pays" ? "player_pays" : DEFAULT_PROCESSING_FEE_MODE;
}

export function processingFeeModeLabel(mode: ProcessingFeeMode): string {
  return mode === "player_pays" ? "Player pays processing fees" : "Society absorbs processing fees";
}

/** Integer ceiling of (intended + fixed) / (1 - basis_points/10000). */
export function grossUpChargePence(intendedPence: number, schedule: ProcessingFeeSchedule = DEFAULT_PROCESSING_FEE_SCHEDULE): number {
  if (!Number.isInteger(intendedPence) || intendedPence <= 0) {
    throw new Error("Intended fee must be a positive number of pence");
  }
  if (!Number.isInteger(schedule.basisPoints) || schedule.basisPoints < 0 || schedule.basisPoints >= 10000) {
    throw new Error("Processing fee rate must be basis points from 0 up to but not including 10000");
  }
  if (!Number.isInteger(schedule.fixedPence) || schedule.fixedPence < 0) {
    throw new Error("Processing fee fixed amount must be zero or more pence");
  }
  const denominator = 10000 - schedule.basisPoints;
  const numerator = (intendedPence + schedule.fixedPence) * 10000;
  return Math.floor((numerator + denominator - 1) / denominator);
}

export function quoteCheckoutCharge(
  intendedPence: number,
  mode: string | null | undefined,
  schedule: ProcessingFeeSchedule = DEFAULT_PROCESSING_FEE_SCHEDULE,
): CheckoutChargeQuote {
  const normalized = normalizeProcessingFeeMode(mode);
  if (normalized === "society_absorbs") {
    return {
      mode: normalized,
      intendedPence,
      estimatedProcessingFeePence: 0,
      grossPence: intendedPence,
      basisPoints: schedule.basisPoints,
      fixedPence: schedule.fixedPence,
    };
  }
  const grossPence = grossUpChargePence(intendedPence, schedule);
  return {
    mode: normalized,
    intendedPence,
    estimatedProcessingFeePence: grossPence - intendedPence,
    grossPence,
    basisPoints: schedule.basisPoints,
    fixedPence: schedule.fixedPence,
  };
}

export type ActualProcessingFee = {
  feePence: number;
  netPence: number;
};

/** Accept a Stripe balance transaction only when its amount, fee, and net agree. */
export function actualProcessingFeeFromBalance(
  balance: { amount?: number | null; fee?: number | null; net?: number | null; currency?: string | null } | null | undefined,
  grossPence: number,
): ActualProcessingFee | null {
  if (!balance) return null;
  if ((balance.currency ?? "").toLowerCase() !== "gbp") return null;
  const amount = balance.amount;
  const fee = balance.fee;
  const net = balance.net;
  if (amount == null || fee == null || net == null) return null;
  if (!Number.isInteger(amount) || !Number.isInteger(fee) || !Number.isInteger(net)) return null;
  if (amount !== grossPence || fee < 0 || net < 0 || fee + net !== amount) return null;
  return { feePence: fee, netPence: net };
}

export function processingFeeVariancePence(mode: ProcessingFeeMode, estimatedProcessingFeePence: number, actualFeePence: number): number | null {
  if (mode !== "player_pays") return null;
  return actualFeePence - estimatedProcessingFeePence;
}

export type RecordedProcessingFee = {
  stripeProcessingFeePence: number | null;
  stripeNetPence: number | null;
  variancePence: number | null;
  reconciled: boolean;
};

/**
 * The recorded fee is the balance-transaction fee. Missing balance data stays
 * null, including when an estimate exists.
 */
export function recordedProcessingFee(input: {
  mode: ProcessingFeeMode;
  estimatedProcessingFeePence: number;
  actual: ActualProcessingFee | null;
}): RecordedProcessingFee {
  if (!input.actual) {
    return {
      stripeProcessingFeePence: null,
      stripeNetPence: null,
      variancePence: null,
      reconciled: false,
    };
  }
  return {
    stripeProcessingFeePence: input.actual.feePence,
    stripeNetPence: input.actual.netPence,
    variancePence: processingFeeVariancePence(input.mode, input.estimatedProcessingFeePence, input.actual.feePence),
    reconciled: true,
  };
}

export function formatGbpFromPence(pence: number): string {
  const sign = pence < 0 ? "-" : "";
  const abs = Math.abs(pence);
  return `${sign}£${(abs / 100).toFixed(2)}`;
}

export type ProcessingFeeLedgerView = {
  modeLabel: string;
  intendedLabel: string;
  grossLabel: string;
  feeLabel: string;
  netLabel: string;
  varianceLabel: string | null;
  reconciliationLabel: string;
  refundLabel: string | null;
};

export function processingFeeLedgerView(row: {
  processing_fee_mode?: string | null;
  intended_fee_pence?: number | null;
  amount_pence: number;
  estimated_processing_fee_pence?: number | null;
  stripe_processing_fee_pence?: number | null;
  stripe_net_pence?: number | null;
  processing_fee_variance_pence?: number | null;
  status?: string | null;
}): ProcessingFeeLedgerView {
  const mode = normalizeProcessingFeeMode(row.processing_fee_mode);
  const intended = row.intended_fee_pence ?? row.amount_pence;
  const actual = row.stripe_processing_fee_pence;
  const reconciled = actual != null && row.stripe_net_pence != null;
  const variance = mode === "player_pays" && row.processing_fee_variance_pence != null
    ? row.processing_fee_variance_pence
    : null;
  return {
    modeLabel: processingFeeModeLabel(mode),
    intendedLabel: formatGbpFromPence(intended),
    grossLabel: formatGbpFromPence(row.amount_pence),
    feeLabel: actual == null ? "awaiting Stripe" : formatGbpFromPence(actual),
    netLabel: row.stripe_net_pence == null ? "awaiting Stripe" : formatGbpFromPence(row.stripe_net_pence),
    varianceLabel: variance == null ? null : formatGbpFromPence(variance),
    reconciliationLabel: reconciled ? "reconciled" : "not reconciled",
    refundLabel: row.status === "refunded" || row.status === "refund_pending"
      ? `Refunded ${formatGbpFromPence(row.amount_pence)} charged`
      : null,
  };
}
