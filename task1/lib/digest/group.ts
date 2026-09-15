/**
 * The one place that decides what goes where, and in what order.
 *
 * The UI, the Markdown export and the HTML export each had their own copy of
 * this, annotated "kept in sync by hand across the three renderers". They had
 * already drifted once: the HTML export was still emitting the old
 * "Read this first" block, with untrimmed titles, after the other two had
 * moved on. A pure function they all call cannot drift, and it can be tested
 * without rendering anything.
 */
import type { ScoredItem } from "../types";
import { isDeadlineStillOpen } from "../dates";
import { daysFromToday } from "../relative-date";

export type SortKey = "deadline" | "relevance";

export interface GroupedDigest {
  /** Items with a submission window still open, soonest close first. */
  open: ScoredItem[];
  /** Everything else: moving through the process, or already decided. */
  awareness: ScoredItem[];
}

/** An item is actionable only if it still carries an open window right now. */
export function hasOpenWindow(item: ScoredItem, now: Date = new Date()): boolean {
  return Boolean(item.actionable && item.deadline && isDeadlineStillOpen(item.deadline, now));
}

function byDeadline(a: ScoredItem, b: ScoredItem): number {
  return new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime();
}

function byScore(a: ScoredItem, b: ScoredItem): number {
  return b.score - a.score;
}

/**
 * Items with no deadline sort by recency, but a scrape-time placeholder is
 * not recency: those rows always look like "today" and would otherwise sit
 * above genuinely new items, so they go last.
 */
function byRecency(a: ScoredItem, b: ScoredItem): number {
  return (
    Number(Boolean(a.dateIsApproximate)) - Number(Boolean(b.dateIsApproximate)) ||
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function groupDigest(
  items: ScoredItem[],
  { now = new Date(), sortBy = "deadline" as SortKey }: { now?: Date; sortBy?: SortKey } = {},
): GroupedDigest {
  const open = items.filter((i) => hasOpenWindow(i, now));
  const awareness = items.filter((i) => !hasOpenWindow(i, now));

  open.sort(sortBy === "deadline" ? byDeadline : byScore);
  awareness.sort(sortBy === "deadline" ? byRecency : byScore);

  return { open, awareness };
}

export interface ListGroups {
  /** Open, closing within 7 days. Same threshold deadlinePhrase uses to switch from a countdown to a date. */
  closingThisWeek: ScoredItem[];
  /** Open, closing beyond 7 days. */
  closingLater: ScoredItem[];
  /** No open submission window. */
  noWindow: ScoredItem[];
}

/**
 * The three row groups the list view actually renders. Splits groupDigest's
 * "open" half again by urgency, since "closing this week" is the one thing
 * a reader scans the whole list for.
 */
export function groupForList(
  items: ScoredItem[],
  { now = new Date(), sortBy = "deadline" as SortKey }: { now?: Date; sortBy?: SortKey } = {},
): ListGroups {
  const { open, awareness } = groupDigest(items, { now, sortBy });
  const closingThisWeek: ScoredItem[] = [];
  const closingLater: ScoredItem[] = [];
  for (const item of open) {
    const days = daysFromToday(item.deadline!, now);
    (days !== undefined && days <= 7 ? closingThisWeek : closingLater).push(item);
  }
  return { closingThisWeek, closingLater, noWindow: awareness };
}

/**
 * The short list for a reader with 30 seconds. Only items with an open
 * window: a block a reader treats as a to-do list must not contain things
 * nobody can do.
 */
export function closingSoonest(
  items: ScoredItem[],
  { now = new Date(), limit = 5 }: { now?: Date; limit?: number } = {},
): ScoredItem[] {
  return items
    .filter((i) => hasOpenWindow(i, now))
    .sort(byDeadline)
    .slice(0, limit);
}
