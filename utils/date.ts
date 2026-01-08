/**
 * Date formatting utilities
 * 
 * All dates are stored internally as ISO format (YYYY-MM-DD)
 * Display dates as DD-MM-YYYY for user-facing UI
 */

/**
 * Convert mixed date-like values into a JS Date.
 *
 * Supports:
 * - Firestore Timestamp (has toDate())
 * - ISO string / other string (Date.parse)
 * - Date (returned as-is)
 * - null/undefined (null)
 */
export function toJsDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  // Firestore Timestamp (or compatible shape)
  if (typeof value === "object" && value !== null) {
    const maybeTimestamp = value as { toDate?: () => Date; seconds?: number; nanoseconds?: number };
    if (typeof maybeTimestamp.toDate === "function") {
      const d = maybeTimestamp.toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    }
    // Timestamp-like object that may have been serialized (best-effort)
    if (typeof maybeTimestamp.seconds === "number") {
      const ms =
        maybeTimestamp.seconds * 1000 +
        (typeof maybeTimestamp.nanoseconds === "number" ? maybeTimestamp.nanoseconds / 1_000_000 : 0);
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
  }

  if (typeof value === "string") {
    if (value.trim() === "") return null;
    // ISO string
    const isoDate = new Date(value);
    if (!isNaN(isoDate.getTime())) return isoDate;

    // Other string - fallback to Date.parse
    const parsed = Date.parse(value);
    if (!isNaN(parsed)) return new Date(parsed);

    return null;
  }

  return null;
}

/**
 * Format a date string (YYYY-MM-DD or ISO) to DD-MM-YYYY for display
 * @param dateValue - Date-like value (string/Date/Timestamp/etc)
 * @returns Formatted date string DD-MM-YYYY, or original string if invalid
 */
export function formatDateDDMMYYYY(dateValue: unknown): string {
  if (dateValue === null || dateValue === undefined) return "No date";
  
  try {
    const date = toJsDate(dateValue);
    if (!date) {
      // Preserve legacy behavior: if it's a string we couldn't parse, return it
      if (typeof dateValue === "string") return dateValue;
      return "No date";
    }
    
    // Format as DD-MM-YYYY
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  } catch (error) {
    console.warn("Error formatting date:", dateValue, error);
    return typeof dateValue === "string" ? dateValue : "No date";
  }
}

/**
 * Parse a DD-MM-YYYY or YYYY-MM-DD string to ISO format (YYYY-MM-DD)
 * @param dateStr - Date string in DD-MM-YYYY or YYYY-MM-DD format
 * @returns ISO format string (YYYY-MM-DD) or null if invalid
 */
export function parseDateToISO(dateStr: string | null | undefined): string | null {
  if (!dateStr || dateStr.trim() === "") return null;
  
  try {
    // Try parsing as YYYY-MM-DD first (already ISO)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return dateStr.trim();
      }
    }
    
    // Try parsing as DD-MM-YYYY
    const parts = dateStr.trim().split("-");
    if (parts.length === 3) {
      // Check if it's DD-MM-YYYY (day > 12) or YYYY-MM-DD (year > 1900)
      const first = parseInt(parts[0], 10);
      const second = parseInt(parts[1], 10);
      const third = parseInt(parts[2], 10);
      
      if (first > 12 && !isNaN(first) && !isNaN(second) && !isNaN(third)) {
        // DD-MM-YYYY format
        const day = first;
        const month = second;
        const year = third;
        if (year >= 1900 && year < 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
      } else if (third > 12 && !isNaN(first) && !isNaN(second) && !isNaN(third)) {
        // YYYY-MM-DD format
        const year = first;
        const month = second;
        const day = third;
        if (year >= 1900 && year < 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
      }
    }
    
    // Try parsing as Date object
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    
    return null;
  } catch (error) {
    console.warn("Error parsing date:", dateStr, error);
    return null;
  }
}














