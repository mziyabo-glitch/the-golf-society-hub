/**
 * Card processing fees and the Golf Society Hub platform fee.
 *
 * Stripe UK consumer-card pricing stays in `DEFAULT_PROCESSING_FEE_SCHEDULE`:
 * 1.5% + 20 pence. Do not edit that schedule to match a later actual Stripe
 * fee. The ledger stores the balance transaction's stripe_fee, and player-pays
 * variance is that actual fee minus the card portion of the quote.
 *
 * Golf Society Hub charges its own platform fee on each Connect destination
 * charge. The rate is `PLATFORM_FEE_BASIS_POINTS` (200 = 2.00% of the intended
 * event fee). Whole pence, half up:
 *   platform_fee = floor((intended_pence * basis_points + 5000) / 10000)
 * 2500 pence -> 50. 333 pence at 2% is 6.66 -> 7. 25 pence at 2% is 0.5 -> 1.
 * The fee is computed on the intended event fee, not on the grossed-up total.
 * Checkout sends it as Stripe Connect `application_fee_amount`.
 *
 * A staging platform-only charge (`STAGING_PLATFORM_ONLY_PAYMENTS` exactly
 * true, no Connect destination) has no application fee. Pass
 * `platformCharge: true` so the quote's platform fee is 0 and Checkout omits
 * `application_fee_amount`.
 *
 * Society absorbs (default): Checkout charges the event fee exactly. The
 * destination charge sets `on_behalf_of` to the Connect account. Whether the
 * card fee is then debited from that account depends on the account
 * controller: a test Custom account with `fees.payer` of `application_custom`
 * still showed the card fee on the platform balance transaction. Society net
 * is the connected account's balance-transaction net when that transaction
 * exists. The card fee is still the `stripe_fee` detail, recorded separately.
 *
 * Player pays: one processing line covers the estimated card fee and the
 * platform fee.
 *   charged = ceil((intended + card_fixed + platform_fee) / (1 - card_rate))
 * The quoted total is intended to leave the society the event fee after both.
 * The card rate is still the schedule above.
 *
 * The payment row snapshots `platform_fee_basis_points` and
 * `platform_fee_pence`. A later rate change does not rewrite that row. The
 * recorded Stripe fee and the recorded application fee come only from Stripe
 * objects, never from this quote.
 *
 * A full Connect refund sets `refund_application_fee: true` so Stripe returns
 * the platform fee with the charge. The ledger does not invent a fee on the
 * refund row. It keeps the actuals already taken from the charge, and records
 * `stripe_application_fee_refunded_pence` only from Stripe's ApplicationFee
 * `amount_refunded`.
 */

export const STRIPE_UK_CARD_FEE_BASIS_POINTS = 150;
export const STRIPE_UK_CARD_FEE_FIXED_PENCE = 20;
export const PLATFORM_FEE_BASIS_POINTS = 200;

export const PLAYER_PROCESSING_FEE_LABEL = "Processing fee (card fee and Golf Society Hub platform fee)";

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
  platformFeeBasisPoints: number;
  platformFeePence: number;
  applicationFeeAmount: number;
  platformCharge: boolean;
};

export function normalizeProcessingFeeMode(value: string | null | undefined): ProcessingFeeMode {
  return value === "player_pays" ? "player_pays" : DEFAULT_PROCESSING_FEE_MODE;
}

export function processingFeeModeLabel(mode: ProcessingFeeMode): string {
  return mode === "player_pays" ? "Player pays processing fees" : "Society absorbs processing fees";
}

/** Half-up whole pence. 2% of 2500 is 50. 2% of 333 is 7. 2% of 25 is 1. */
export function platformFeePence(intendedPence: number, basisPoints: number = PLATFORM_FEE_BASIS_POINTS): number {
  if (!Number.isInteger(intendedPence) || intendedPence < 0) {
    throw new Error("Intended fee must be zero or more pence");
  }
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints >= 10000) {
    throw new Error("Platform fee rate must be basis points from 0 up to but not including 10000");
  }
  return Math.floor((intendedPence * basisPoints + 5000) / 10000);
}

/** Integer ceiling of (intended + fixed + extra) / (1 - basis_points/10000). */
export function grossUpChargePence(
  intendedPence: number,
  schedule: ProcessingFeeSchedule = DEFAULT_PROCESSING_FEE_SCHEDULE,
  extraPence = 0,
): number {
  if (!Number.isInteger(intendedPence) || intendedPence <= 0) {
    throw new Error("Intended fee must be a positive number of pence");
  }
  if (!Number.isInteger(schedule.basisPoints) || schedule.basisPoints < 0 || schedule.basisPoints >= 10000) {
    throw new Error("Processing fee rate must be basis points from 0 up to but not including 10000");
  }
  if (!Number.isInteger(schedule.fixedPence) || schedule.fixedPence < 0) {
    throw new Error("Processing fee fixed amount must be zero or more pence");
  }
  if (!Number.isInteger(extraPence) || extraPence < 0) {
    throw new Error("Extra amount must be zero or more pence");
  }
  const denominator = 10000 - schedule.basisPoints;
  const numerator = (intendedPence + schedule.fixedPence + extraPence) * 10000;
  return Math.floor((numerator + denominator - 1) / denominator);
}

export function quoteCheckoutCharge(
  intendedPence: number,
  mode: string | null | undefined,
  schedule: ProcessingFeeSchedule = DEFAULT_PROCESSING_FEE_SCHEDULE,
  options: { platformCharge?: boolean } = {},
): CheckoutChargeQuote {
  const platformCharge = options.platformCharge === true;
  const platformFeeBasisPoints = platformCharge ? 0 : PLATFORM_FEE_BASIS_POINTS;
  const feePence = platformCharge ? 0 : platformFeePence(intendedPence, PLATFORM_FEE_BASIS_POINTS);
  const normalized = normalizeProcessingFeeMode(mode);
  if (normalized === "society_absorbs") {
    return {
      mode: normalized,
      intendedPence,
      estimatedProcessingFeePence: 0,
      grossPence: intendedPence,
      basisPoints: schedule.basisPoints,
      fixedPence: schedule.fixedPence,
      platformFeeBasisPoints,
      platformFeePence: feePence,
      applicationFeeAmount: feePence,
      platformCharge,
    };
  }
  const grossPence = grossUpChargePence(intendedPence, schedule, feePence);
  return {
    mode: normalized,
    intendedPence,
    estimatedProcessingFeePence: grossPence - intendedPence,
    grossPence,
    basisPoints: schedule.basisPoints,
    fixedPence: schedule.fixedPence,
    platformFeeBasisPoints,
    platformFeePence: feePence,
    applicationFeeAmount: feePence,
    platformCharge,
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

export type StripeFeeDetail = { type?: string | null; amount?: number | null };

export type ActualStripeFees = {
  stripeFeePence: number;
  applicationFeePence: number;
  societyNetPence: number;
};

function sumFeeDetails(details: StripeFeeDetail[], type: string): number | null {
  let sum = 0;
  for (const detail of details) {
    if ((detail.type ?? "") !== type) continue;
    if (!Number.isInteger(detail.amount) || (detail.amount as number) < 0) return null;
    sum += detail.amount as number;
  }
  return sum;
}

/**
 * Split a real Stripe balance transaction into the card fee and the
 * application fee. A missing application-fee field with no fee details is the
 * older charge shape and records an application fee of 0. A positive
 * application fee with no fee details is not guessed. The quote is never used.
 */
type FeeBalance = {
  amount?: number | null;
  fee?: number | null;
  net?: number | null;
  currency?: string | null;
  feeDetails?: StripeFeeDetail[] | null;
};

/**
 * Split Stripe objects into the card fee, the application fee, and the
 * society net. The card fee is the `stripe_fee` detail. The application fee
 * is the charge amount, checked against any `application_fee` detail. Society
 * net is the connected-account balance transaction net when that transaction
 * is supplied. A platform balance that does not contain the application fee
 * is not turned into a guessed society net.
 */
export function actualFeesFromStripe(input: {
  balance: FeeBalance | null | undefined;
  destinationBalance?: FeeBalance | null;
  grossPence: number;
  applicationFeeAmount?: number | null;
}): ActualStripeFees | null {
  const platform = actualProcessingFeeFromBalance(input.balance, input.grossPence);
  const destination = input.destinationBalance
    ? actualProcessingFeeFromBalance(input.destinationBalance, input.grossPence)
    : null;
  if (!platform && !destination) return null;

  const platformDetails = Array.isArray(input.balance?.feeDetails) ? input.balance.feeDetails : null;
  const destinationDetails = Array.isArray(input.destinationBalance?.feeDetails) ? input.destinationBalance.feeDetails : null;
  const platformStripe = platformDetails ? sumFeeDetails(platformDetails, "stripe_fee") : null;
  const destinationStripe = destinationDetails ? sumFeeDetails(destinationDetails, "stripe_fee") : null;
  const platformApplication = platformDetails ? sumFeeDetails(platformDetails, "application_fee") : null;
  const destinationApplication = destinationDetails ? sumFeeDetails(destinationDetails, "application_fee") : null;
  if (platformStripe == null && platformDetails) return null;
  if (destinationStripe == null && destinationDetails) return null;
  if (platformApplication == null && platformDetails) return null;
  if (destinationApplication == null && destinationDetails) return null;

  const detailApplication = (platformApplication ?? 0) + (destinationApplication ?? 0);
  if (
    input.applicationFeeAmount != null
    && detailApplication > 0
    && input.applicationFeeAmount !== detailApplication
  ) {
    return null;
  }
  const applicationFee = input.applicationFeeAmount != null
    ? input.applicationFeeAmount
    : (platformDetails || destinationDetails ? detailApplication : 0);
  if (!Number.isInteger(applicationFee) || applicationFee < 0) return null;

  const stripeFromDetails = (platformStripe ?? 0) + (destinationStripe ?? 0);
  const hasStripeDetail = (platformStripe ?? 0) > 0 || (destinationStripe ?? 0) > 0;
  let stripeFee = hasStripeDetail ? stripeFromDetails : null;
  if (stripeFee == null && applicationFee === 0 && platform) stripeFee = platform.feePence;
  if (stripeFee == null) return null;

  if (destination) {
    const societyNet = destination.netPence;
    const destinationExplainsFee = destinationDetails
      && (destinationStripe ?? 0) + (destinationApplication ?? 0) === destination.feePence;
    if (!destinationExplainsFee) return null;
    const bothOnSociety = stripeFee + applicationFee + societyNet === input.grossPence;
    const cardFeeOnPlatform = applicationFee + societyNet === input.grossPence;
    if (!bothOnSociety && !cardFeeOnPlatform) return null;
    return { stripeFeePence: stripeFee, applicationFeePence: applicationFee, societyNetPence: societyNet };
  }

  if (!platform) return null;
  if (applicationFee > 0 && (platformApplication ?? 0) === 0) return null;
  const societyNet = (platformApplication ?? 0) > 0 ? platform.netPence : platform.netPence;
  if (stripeFee + applicationFee + societyNet !== input.grossPence) return null;
  return { stripeFeePence: stripeFee, applicationFeePence: applicationFee, societyNetPence: societyNet };
}

export function processingFeeVariancePence(
  mode: ProcessingFeeMode,
  estimatedProcessingFeePence: number,
  actualFeePence: number,
  snapshotPlatformFeePence = 0,
): number | null {
  if (mode !== "player_pays") return null;
  return actualFeePence - (estimatedProcessingFeePence - snapshotPlatformFeePence);
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
  platformFeePence?: number;
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
    variancePence: processingFeeVariancePence(
      input.mode,
      input.estimatedProcessingFeePence,
      input.actual.feePence,
      input.platformFeePence ?? 0,
    ),
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
  platformFeeLabel: string;
  netLabel: string;
  varianceLabel: string | null;
  reconciliationLabel: string;
  refundLabel: string | null;
  platformFeeRefundLabel: string | null;
  cardFeeLabel: string | null;
};

export function processingFeeLedgerView(row: {
  processing_fee_mode?: string | null;
  intended_fee_pence?: number | null;
  amount_pence: number;
  estimated_processing_fee_pence?: number | null;
  stripe_processing_fee_pence?: number | null;
  stripe_net_pence?: number | null;
  stripe_application_fee_pence?: number | null;
  stripe_application_fee_refunded_pence?: number | null;
  processing_fee_variance_pence?: number | null;
  status?: string | null;
}): ProcessingFeeLedgerView {
  const mode = normalizeProcessingFeeMode(row.processing_fee_mode);
  const intended = row.intended_fee_pence ?? row.amount_pence;
  const stripeFee = row.stripe_processing_fee_pence;
  const applicationFee = row.stripe_application_fee_pence;
  const net = row.stripe_net_pence;
  const bothOnSociety = stripeFee != null && applicationFee != null && net != null
    && stripeFee + applicationFee + net === row.amount_pence;
  const cardFeeOnPlatform = stripeFee != null && applicationFee != null && net != null
    && applicationFee + net === row.amount_pence
    && !bothOnSociety;
  const legacyReconciled = stripeFee != null && net != null && applicationFee == null
    && stripeFee + net === row.amount_pence;
  const reconciled = bothOnSociety || cardFeeOnPlatform || legacyReconciled;
  const variance = mode === "player_pays" && row.processing_fee_variance_pence != null
    ? row.processing_fee_variance_pence
    : null;
  const platformFeeLabel = applicationFee == null
    ? (stripeFee == null ? "awaiting Stripe" : "not recorded")
    : formatGbpFromPence(applicationFee);
  const refundedApplicationFee = row.stripe_application_fee_refunded_pence;
  return {
    modeLabel: processingFeeModeLabel(mode),
    intendedLabel: formatGbpFromPence(intended),
    grossLabel: formatGbpFromPence(row.amount_pence),
    feeLabel: stripeFee == null ? "awaiting Stripe" : formatGbpFromPence(stripeFee),
    platformFeeLabel,
    netLabel: net == null ? "awaiting Stripe" : formatGbpFromPence(net),
    varianceLabel: variance == null ? null : formatGbpFromPence(variance),
    reconciliationLabel: reconciled ? "reconciled" : "not reconciled",
    refundLabel: row.status === "refunded" || row.status === "refund_pending"
      ? `Refunded ${formatGbpFromPence(row.amount_pence)} charged`
      : null,
    platformFeeRefundLabel: refundedApplicationFee != null && refundedApplicationFee > 0
      ? `Platform fee refunded ${formatGbpFromPence(refundedApplicationFee)}`
      : null,
    cardFeeLabel: cardFeeOnPlatform ? "Stripe card fee is on the platform balance" : null,
  };
}
