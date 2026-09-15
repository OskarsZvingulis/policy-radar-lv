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

/**
 * "Today" in Riga, as a day number (midnight UTC of that calendar date).
 *
 * This used to be UTC's today, which is wrong for a Latvian tool by exactly
 * the offset: between 00:00 and 03:00 Riga time the UTC date is still
 * yesterday, so a consultation closing that morning read as "closes
 * tomorrow", and one closing overnight read as still open. Naming the zone
 * explicitly also keeps the server render and the client hydration in
 * agreement, since neither depends on the machine's own zone.
 */
const RIGA_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Riga",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function startOfTodayUtc(now: Date = new Date()): number {
  const [year, month, day] = RIGA_DAY.format(now).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/**
 * True while the deadline's own calendar day has not yet finished, in Riga
 * terms.
 *
 * This used to compute a real millisecond instant (the deadline's own UTC
 * day's last millisecond) and compare it against `now.getTime()` — mixing a
 * "day number" value (every date this app stores is UTC midnight standing in
 * for a Riga calendar date, per this file's own convention) with a real
 * instant comparison. Riga runs 2-3 hours ahead of UTC, so for roughly that
 * many hours after Riga midnight, a deadline already "closed" by every date
 * label on the page (`daysFromToday`, "closes today" vs "closed") still
 * measured as open here, because UTC midnight hadn't turned over yet. Found
 * live: at 21:00 UTC (00:00 Riga, the exact boundary), a 15-Sep deadline
 * still read `isDeadlineStillOpen === true` while `daysFromToday` already
 * called it "yesterday". Comparing day numbers instead, the same way
 * `isTodayOrLater` above already does, removes the mismatch: both now ask
 * the same question the same way.
 */
export function isDeadlineStillOpen(deadlineIso: string | undefined, now: Date = new Date()): boolean {
  if (!deadlineIso) return false;
  const d = new Date(deadlineIso);
  if (Number.isNaN(d.getTime())) return false;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) >= startOfTodayUtc(now);
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

export function describeItemDates(
  item: {
    source: string;
    date: string;
    deadline?: string;
    dateIsApproximate?: boolean;
  },
  now: Date = new Date(),
): ItemDateLabel[] {
  const out: ItemDateLabel[] = [];
  // A date that has passed is not a deadline any more, it is history. Marking
  // one `isDeadline` made the card render it in red and the UI read "closed",
  // which is action styling for something nobody can act on. Closed windows
  // come back below as ordinary context instead.
  if (item.deadline && isDeadlineStillOpen(item.deadline, now)) {
    const label =
      item.source === "tap_consultations"
        ? "Consultation deadline"
        : NEWS_SOURCES.has(item.source)
          ? "Application deadline"
          : "Comment deadline";
    out.push({ label, iso: item.deadline, isDeadline: true });
  } else if (item.deadline) {
    const label = item.source === "tap_consultations" ? "Consultation closed" : "Comments closed";
    out.push({ label, iso: item.deadline, isDeadline: false });
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
