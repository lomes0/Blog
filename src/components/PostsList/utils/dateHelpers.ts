/**
 * Date formatting utilities for the PostsList component
 */

import { PartitionGranularity } from "@/types/partitioning";

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
 * Get day key for grouping (YYYY-MM-DD format)
 * @param date - Date object or date string
 * @returns Day key like "2024-01-15"
 */
export const getDayKey = (date: Date | string): string => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Get week key for grouping (YYYY-WW format)
 * @param date - Date object or date string
 * @returns Week key like "2024-W03"
 */
export const getWeekKey = (date: Date | string): string => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const year = dateObj.getFullYear();
  
  // Get the first day of the year
  const startOfYear = new Date(year, 0, 1);
  
  // Calculate the difference in days
  const daysDiff = Math.floor((dateObj.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
  
  // Calculate week number (ISO week numbering)
  const weekNumber = Math.ceil((daysDiff + startOfYear.getDay() + 1) / 7);
  
  return `${year}-W${String(weekNumber).padStart(2, "0")}`;
};

/**
 * Get year key for grouping (YYYY format)
 * @param date - Date object or date string
 * @returns Year key like "2024"
 */
export const getYearKey = (date: Date | string): string => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return String(dateObj.getFullYear());
};

export const getQuarterKey = (date: Date | string): string => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const year = dateObj.getFullYear();
  const quarter = Math.floor(dateObj.getMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
};

export const getHalfYearKey = (date: Date | string): string => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const year = dateObj.getFullYear();
  const halfYear = Math.floor(dateObj.getMonth() / 6) + 1;
  return `${year}-H${halfYear}`;
};

/**
 * Get time key based on granularity
 * @param date - Date object or date string
 * @param granularity - Partitioning granularity
 * @returns Time key appropriate for the granularity
 */
export const getTimeKey = (date: Date | string, granularity: PartitionGranularity): string => {
  switch (granularity) {
    case "day":
      return getDayKey(date);
    case "week":
      return getWeekKey(date);
    case "month":
      return getMonthKey(date);
    case "quarter":
      return getQuarterKey(date);
    case "halfyear":
      return getHalfYearKey(date);
    case "year":
      return getYearKey(date);
    default:
      return getMonthKey(date); // Default to month
  }
};

/**
 * Format time header based on granularity
 * @param timeKey - Time key from getTimeKey
 * @param granularity - Partitioning granularity
 * @returns Formatted header string
 */
export const formatTimeHeader = (timeKey: string, granularity: PartitionGranularity): string => {
  switch (granularity) {
    case "day":
      // Convert "2024-01-15" to "January 15, 2024"
      return new Date(timeKey).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    case "week":
      // Convert "2024-W03" to "Week 3, 2024"
      const [yearPart, weekPart] = timeKey.split("-W");
      return `Week ${parseInt(weekPart)}, ${yearPart}`;
    case "month":
      // Convert "2024-01" to "January 2024"
      return formatMonthHeader(new Date(timeKey + "-01"));
    case "quarter":
      // Convert "2024-Q1" to "Q1 2024"
      const [quarterYear, quarterPart] = timeKey.split("-Q");
      return `Q${quarterPart} ${quarterYear}`;
    case "halfyear":
      // Convert "2024-H1" to "H1 2024"
      const [halfYear, halfPart] = timeKey.split("-H");
      return `H${halfPart} ${halfYear}`;
    case "year":
      // Convert "2024" to "2024"
      return timeKey;
    default:
      return timeKey;
  }
};

/**
 * Create a Date object from a month key
 * @param monthKey - Month key like "2024-01"
 * @returns Date object for the first day of that month
 */
export const monthKeyToDate = (monthKey: string): Date => {
  return new Date(monthKey + "-01");
};

/**
 * Create a Date object from any time key
 * @param timeKey - Time key from getTimeKey
 * @param granularity - Partitioning granularity
 * @returns Date object representing the start of that time period
 */
export const timeKeyToDate = (timeKey: string, granularity: PartitionGranularity): Date => {
  switch (granularity) {
    case "day":
      return new Date(timeKey);
    case "week":
      // Convert "2024-W03" to the Monday of that week
      const [year, weekStr] = timeKey.split("-W");
      const week = parseInt(weekStr);
      const startOfYear = new Date(parseInt(year), 0, 1);
      const daysToAdd = (week - 1) * 7 - startOfYear.getDay() + 1;
      return new Date(startOfYear.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    case "month":
      return monthKeyToDate(timeKey);
    case "quarter":
      // Convert "2024-Q1" to the first day of that quarter
      const [qYear, qPart] = timeKey.split("-Q");
      const quarterNum = parseInt(qPart);
      const quarterStartMonth = (quarterNum - 1) * 3;
      return new Date(parseInt(qYear), quarterStartMonth, 1);
    case "halfyear":
      // Convert "2024-H1" to the first day of that half-year
      const [hYear, hPart] = timeKey.split("-H");
      const halfYearNum = parseInt(hPart);
      const halfYearStartMonth = (halfYearNum - 1) * 6;
      return new Date(parseInt(hYear), halfYearStartMonth, 1);
    case "year":
      return new Date(parseInt(timeKey), 0, 1);
    default:
      return new Date(timeKey);
  }
};
