/**
 * Date formatting utilities for the PostsList component
 */

/**
 * Format a date into a month/year display string
 * @param date - Date object
 * @returns Formatted string like "January 2024"
 */
export const formatMonthHeader = (date: Date): string => {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
};

/**
 * Get month key for grouping (YYYY-MM format)
 * @param date - Date object or date string
 * @returns Month key like "2024-01"
 */
export const getMonthKey = (date: Date | string): string => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

/**
 * Create a Date object from a month key
 * @param monthKey - Month key like "2024-01"
 * @returns Date object for the first day of that month
 */
export const monthKeyToDate = (monthKey: string): Date => {
  return new Date(monthKey + "-01");
};
