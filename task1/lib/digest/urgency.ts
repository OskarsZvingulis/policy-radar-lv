/**
 * The one place a date gets a colour. Everything the list renders (the date
 * column, the detail pane's timeline) calls this rather than deciding for
 * itself, so a future palette change has exactly one function to touch.
 */
import { daysFromToday, absoluteDay } from "../relative-date";

export type Urgency = "today" | "week" | "later" | "none";

/**
 * `iso` must be a deadline that is confirmed still open. This function does
 * not check that itself, because "closed" and "no deadline at all" both mean
 * the same thing here: no urgency colour. A negative day count (a date that
 * has already passed) still resolves to "none" as a defensive fallback, so a
 * closed deadline can never render as urgent even if a caller passes one in.
 */
export function urgencyOf(iso: string | undefined, now: Date = new Date()): Urgency {
  if (!iso) return "none";
  const days = daysFromToday(iso, now);
  if (days === undefined || days < 0) return "none";
  if (days <= 1) return "today";
  if (days <= 7) return "week";
  return "later";
}

/** Compact label for the row's date column: "Today", "Tomorrow", or "18 Sep". */
export function rowDateLabel(iso: string, now: Date = new Date()): string {
  const days = daysFromToday(iso, now);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return absoluteDay(iso, now);
}
