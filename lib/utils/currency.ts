/**
 * Currency Utilities
 *
 * Handles conversion between pence (integer storage) and GBP display format.
 * All monetary values are stored as integers in pence to avoid floating point issues.
 */

/**
 * Parse a currency string (in pounds) to pence
 * Handles various input formats: "12.50", "£12.50", "12", etc.
 *
 * @param value - Currency string in pounds
 * @returns Integer pence value, or null if invalid
 *
 * @example
 * parseCurrencyToPence("12.50") // 1250
 * parseCurrencyToPence("£100") // 10000
 * parseCurrencyToPence("") // null
 */
export function parseCurrencyToPence(value: string): number | null {
  if (!value || typeof value !== "string") {
    return null;
  }

  // Remove currency symbols, commas, and whitespace
  const cleaned = value.replace(/[£$,\s]/g, "").trim();

  if (!cleaned) {
    return null;
  }

  const num = parseFloat(cleaned);

  if (isNaN(num) || !isFinite(num)) {
    return null;
  }

  // Convert to pence and round to avoid floating point issues
  return Math.round(num * 100);
}

/**
 * Format pence to GBP string
 *
 * @param pence - Integer pence value
 * @param options - Formatting options
 * @returns Formatted string like "£12.50"
 *
 * @example
 * formatPenceToGBP(1250) // "£12.50"
 * formatPenceToGBP(0) // "£0.00"
 * formatPenceToGBP(null) // "£0.00"
 * formatPenceToGBP(1250, { showSign: true }) // "+£12.50"
 * formatPenceToGBP(-1250, { showSign: true }) // "-£12.50"
 */
export function formatPenceToGBP(
  pence: number | null | undefined,
  options?: {
    showSign?: boolean;
    omitSymbol?: boolean;
  }
): string {
  const { showSign = false, omitSymbol = false } = options || {};
  const value = pence ?? 0;
  const pounds = Math.abs(value) / 100;
  const formatted = pounds.toFixed(2);

  let result = omitSymbol ? formatted : `£${formatted}`;

  if (showSign) {
    if (value > 0) {
      result = `+${result}`;
    } else if (value < 0) {
      result = `-${result}`;
    }
  } else if (value < 0) {
    result = `-${result}`;
  }

  return result;
}

/**
 * Format pence to pounds number (for input fields)
 *
 * @param pence - Integer pence value
 * @returns Pounds as a string with 2 decimal places
 *
 * @example
 * formatPenceToPoundsInput(1250) // "12.50"
 * formatPenceToPoundsInput(0) // ""
 * formatPenceToPoundsInput(null) // ""
 */
export function formatPenceToPoundsInput(
  pence: number | null | undefined
): string {
  if (pence == null || pence === 0) {
    return "";
  }
  const pounds = pence / 100;
  return pounds.toFixed(2);
}

/**
 * Validate a currency input string
 *
 * @param value - Currency string to validate
 * @returns True if valid, false otherwise
 */
export function isValidCurrencyInput(value: string): boolean {
  if (!value || !value.trim()) {
    return false;
  }
  const pence = parseCurrencyToPence(value);
  return pence !== null && pence >= 0;
}
