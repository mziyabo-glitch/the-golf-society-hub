/**
 * Date formatting utilities
 * 
 * All dates are stored internally as ISO format (YYYY-MM-DD)
 * Display dates as DD-MM-YYYY for user-facing UI
 */

/**
 * Format a date string (YYYY-MM-DD or ISO) to DD-MM-YYYY for display
 * @param dateStr - Date string in YYYY-MM-DD or ISO format
 * @returns Formatted date string DD-MM-YYYY, or original string if invalid
 */
export function formatDateDDMMYYYY(dateStr: string | null | undefined): string {
  if (!dateStr || dateStr.trim() === "") return "No date";
  
  try {
    // Try parsing as ISO date
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      // Try parsing as YYYY-MM-DD directly
      const parts = dateStr.trim().split("-");
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const day = parseInt(parts[2], 10);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`;
        }
      }
      return dateStr; // Return original if can't parse
    }
    
    // Format as DD-MM-YYYY
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  } catch (error) {
    console.warn("Error formatting date:", dateStr, error);
    return dateStr; // Return original on error
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





