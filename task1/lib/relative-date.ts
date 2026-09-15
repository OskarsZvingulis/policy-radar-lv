/**
 * Dates as a reader thinks about them, not as the wire carries them.
 *
 * The digest exists to answer "do I need to do something, and by when". An
 * ISO string makes the reader do the arithmetic; "3 days left" is the answer
 * they were going to compute anyway. Absolute dates only reappear once the
 * distance stops being the useful part (a week out, or in the past).
 *
 * Day granularity throughout, matching lib/dates.ts — a deadline is a
 * calendar day, so a consultation closing today is open all day, not expired
 * at 00:00.
 *
 * Month names are a hardcoded English table rather than toLocaleDateString:
 * this renders on the server and again on the client during hydration, and
 * Node's ICU build and the browser's do not always agree on abbreviations.
 * A fixed table means the two passes produce identical text.
 */
import { startOfTodayUtc } from "./dates";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Whole calendar days from today to the given date; negative is the past. */
export function daysFromToday(iso: string, now: Date = new Date()): number | undefined {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((day - startOfTodayUtc(now)) / 86_400_000);
}

/** "15 Sep", or "15 Sep 2027" when the year differs from the current one. */
export function absoluteDay(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const base = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return d.getUTCFullYear() === now.getUTCFullYear() ? base : `${base} ${d.getUTCFullYear()}`;
}

/**
 * Deadline phrasing. Inside a week the countdown is the point; beyond that
 * the exact date is more useful than "in 19 days", which nobody converts.
 */
export function deadlinePhrase(iso: string, now: Date = new Date()): string {
  const days = daysFromToday(iso, now);
  if (days === undefined) return "";
  if (days < 0) return "closed";
  if (days === 0) return "closes today";
  if (days === 1) return "1 day left";
  if (days <= 7) return `${days} days left`;
  return `closes ${absoluteDay(iso, now)}`;
}

/**
 * Non-deadline dates (published, submitted, meeting held). These are context,
 * so they stay short and never imply an action.
 */
export function pastPhrase(iso: string, now: Date = new Date()): string {
  const days = daysFromToday(iso, now);
  if (days === undefined) return "";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 1 && days <= 7) return `in ${days} days`;
  if (days < -1 && days >= -7) return `${-days} days ago`;
  return absoluteDay(iso, now);
}
