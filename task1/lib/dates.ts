/**
 * Day-granularity date helpers.
 *
 * Every date this app handles is a *calendar day*, not an instant: Latvian
 * sources publish "25.09.2026." and mean "any time during 25 September".
 * parseLvDate stores those as UTC midnight, so comparing them directly
 * against Date.now() silently treats the whole final day as already past —
 * a consultation closing today reads as closed from 00:00 onward, which is
 * exactly the day it matters most. Everything here compares whole days.
 *
 * UTC is used as the reference day rather than Europe/Riga (UTC+2/+3). The
 * difference only shows in the small hours; erring this way keeps an item
 * visible slightly longer rather than hiding it early, which is the safer
 * direction for a deadline tracker.
 */

/** Midnight UTC today, as an epoch ms value. */
export function startOfTodayUtc(now: Date = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** Last millisecond of the calendar day the given ISO date falls on. */
export function endOfDayUtc(iso: string): number | undefined {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + 86_400_000 - 1;
}

/** True while the deadline's own calendar day has not yet finished. */
export function isDeadlineStillOpen(deadlineIso: string | undefined, now: Date = new Date()): boolean {
  if (!deadlineIso) return false;
  const end = endOfDayUtc(deadlineIso);
  return end !== undefined && end >= now.getTime();
}

/** True for a date falling today or later (day granularity). */
export function isTodayOrLater(iso: string | undefined, now: Date = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) >= startOfTodayUtc(now);
}

/** True for a date within the trailing `days` window (day granularity). */
export function isWithinTrailingDays(iso: string | undefined, days: number, now: Date = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = startOfTodayUtc(now) - (days - 1) * 86_400_000;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) >= cutoff;
}


/**
 * What to call an item's date(s) in the UI, chosen by source rather than
 * guessed from the field name — "deadline" only ever means a genuine
 * submission window; a meeting or publish date is informational, never
 * action language.
 */
export interface ItemDateLabel {
  label: string;
  iso: string;
  isDeadline: boolean;
}

const MEETING_SOURCES = new Set(["tap_vss", "tap_mk", "saeima_committees"]);
const NEWS_SOURCES = new Set(["em_news", "liaa_news", "altum_news"]);

export function describeItemDates(item: {
  source: string;
  date: string;
  deadline?: string;
  dateIsApproximate?: boolean;
}): ItemDateLabel[] {
  const out: ItemDateLabel[] = [];
  if (item.deadline) {
    const label =
      item.source === "tap_consultations"
        ? "Consultation deadline"
        : NEWS_SOURCES.has(item.source)
          ? "Application deadline"
          : "Comment deadline";
    out.push({ label, iso: item.deadline, isDeadline: true });
  }
  if (!item.dateIsApproximate) {
    const label = MEETING_SOURCES.has(item.source)
      ? "Meeting date"
      : NEWS_SOURCES.has(item.source)
        ? "Published"
        : "Submitted";
    out.push({ label, iso: item.date, isDeadline: false });
  }
  return out;
}
