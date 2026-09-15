/**
 * The one place filtering decisions get made. Components call this and
 * render what comes back; nothing here touches JSX, so it is testable
 * without React and cannot drift from what the sidebar counts claim.
 */
import type { NotRelevantItem, ScoredItem } from "../types";
import { hasOpenWindow } from "./group";
import { matchedTopics, topicLabel } from "./topics";
import { matchesQuery, type Searchable } from "./search";
import { displayTitle } from "../display-title";

export type ViewId = "open" | "all" | "not_relevant";

export interface FilterState {
  view: ViewId;
  /** OR'd: an item matches if it has any of the selected topics. */
  topics: string[];
  sources: string[];
  query: string;
}

export const DEFAULT_FILTER_STATE: FilterState = { view: "open", topics: [], sources: [], query: "" };

function toSearchable(item: ScoredItem): Searchable {
  return {
    title: displayTitle(item.title).text,
    fullTitle: item.title,
    institution: item.institution,
    stage: item.stage,
    sourceLabel: item.sourceLabel,
    topics: matchedTopics(item.matchedRules).map(topicLabel),
  };
}

function toSearchableNotRelevant(item: NotRelevantItem): Searchable {
  return { title: displayTitle(item.title).text, fullTitle: item.title, sourceLabel: item.sourceLabel };
}

function bySources<T extends { source: string }>(sources: string[]) {
  return (item: T) => sources.length === 0 || sources.includes(item.source);
}

function byTopics(topics: string[]) {
  return (item: ScoredItem) =>
    topics.length === 0 || matchedTopics(item.matchedRules).some((t) => topics.includes(t));
}

export interface FilterCounts {
  open: number;
  all: number;
  notRelevant: number;
  bySource: Record<string, number>;
  byTopic: Record<string, number>;
}

export interface FilterResult {
  /** The active view's relevant items, unsorted (grouping/sorting happens separately). */
  items: ScoredItem[];
  notRelevantItems: NotRelevantItem[];
  counts: FilterCounts;
}

export function applyFilters(
  scored: ScoredItem[],
  notRelevant: NotRelevantItem[],
  state: FilterState,
  now: Date = new Date(),
): FilterResult {
  const sourceMatch = bySources<ScoredItem>(state.sources);
  const sourceMatchNotRelevant = bySources<NotRelevantItem>(state.sources);
  const topicMatch = byTopics(state.topics);
  const queryMatch = (item: ScoredItem) => matchesQuery(toSearchable(item), state.query);
  const queryMatchNotRelevant = (item: NotRelevantItem) => matchesQuery(toSearchableNotRelevant(item), state.query);

  // View counts reflect the search query only. Source/topic are sub-filters
  // within a view, so switching view never silently drops a filter the
  // reader set elsewhere.
  const relevantByQuery = scored.filter(queryMatch);
  const openCount = relevantByQuery.filter((i) => hasOpenWindow(i, now)).length;
  const allCount = relevantByQuery.length;
  const notRelevantCount = notRelevant.filter(queryMatchNotRelevant).length;

  const notRelevantByQuery = notRelevant.filter(queryMatchNotRelevant);

  const viewBase =
    state.view === "not_relevant"
      ? []
      : relevantByQuery.filter((i) => (state.view === "open" ? hasOpenWindow(i, now) : true));

  // Source counts: every filter except the source one, so picking a second
  // source shows how many more rows it would add. In the "not relevant" view
  // there is no relevant-item base to count from. The sidebar is showing
  // where the *excluded* items came from, so it counts those instead.
  const bySource: Record<string, number> = {};
  const sourceCountBase = state.view === "not_relevant" ? notRelevantByQuery : viewBase.filter(topicMatch);
  for (const item of sourceCountBase) {
    bySource[item.source] = (bySource[item.source] ?? 0) + 1;
  }

  // Topic counts: every filter except the topic one, same reasoning. Not
  // relevant items carry no topic, so this stays empty in that view. The
  // sidebar already hides the Topics section there for the same reason.
  const byTopic: Record<string, number> = {};
  for (const item of viewBase.filter(sourceMatch)) {
    for (const t of matchedTopics(item.matchedRules)) byTopic[t] = (byTopic[t] ?? 0) + 1;
  }

  const items = viewBase.filter(sourceMatch).filter(topicMatch);
  const notRelevantItems = state.view === "not_relevant" ? notRelevantByQuery.filter(sourceMatchNotRelevant) : [];

  return {
    items,
    notRelevantItems,
    counts: { open: openCount, all: allCount, notRelevant: notRelevantCount, bySource, byTopic },
  };
}
