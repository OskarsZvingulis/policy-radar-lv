/**
 * Pure state and URL (de)serialization for the digest page's filters, page
 * and selected item. Kept out of the hook so the reducer is testable without
 * React or a browser.
 *
 * The bug this exists to fix: the previous hook derived its state straight
 * from useSearchParams() and wrote changes with router.replace(). On a
 * force-dynamic page that is a real server round trip, so the next click's
 * handler still closed over the old params until it completed. A fast
 * sequence of clicks (view, then a topic, then another topic, then typing)
 * each started from a stale snapshot and clobbered whatever the previous
 * click had just set. Moving the canonical state into React itself (a
 * reducer, held by the hook) and writing the URL as a one-way mirror via
 * history.replaceState removes the round trip entirely: dispatch always
 * applies to React's own latest state, never to what the address bar
 * happened to say.
 */
import { DEFAULT_FILTER_STATE, type FilterState, type ViewId } from "./filter";

export interface UrlState extends FilterState {
  page: number;
  /** Id of the selected item, if any. Deep-links a single row. */
  item?: string;
}

export const DEFAULT_URL_STATE: UrlState = { ...DEFAULT_FILTER_STATE, page: 1, item: undefined };

const VALID_VIEWS: ViewId[] = ["open", "all", "not_relevant"];

function parseView(raw: string | null): ViewId {
  return VALID_VIEWS.includes(raw as ViewId) ? (raw as ViewId) : DEFAULT_FILTER_STATE.view;
}

function splitParam(raw: string | null): string[] {
  return raw ? raw.split(",").filter(Boolean) : [];
}

/** Reads filter/page/item state from a location's search string (with or without the leading "?"). */
export function parseUrlState(search: string): UrlState {
  const params = new URLSearchParams(search);
  return {
    view: parseView(params.get("view")),
    topics: splitParam(params.get("topic")),
    sources: splitParam(params.get("source")),
    query: params.get("q") ?? "",
    page: Math.max(1, Number(params.get("page")) || 1),
    item: params.get("item") ?? undefined,
  };
}

/** The inverse of parseUrlState: a query string (no leading "?") for a given state. */
export function serializeUrlState(state: UrlState): string {
  const next = new URLSearchParams();
  if (state.view !== DEFAULT_URL_STATE.view) next.set("view", state.view);
  if (state.topics.length > 0) next.set("topic", state.topics.join(","));
  if (state.sources.length > 0) next.set("source", state.sources.join(","));
  if (state.query) next.set("q", state.query);
  if (state.page > 1) next.set("page", String(state.page));
  if (state.item) next.set("item", state.item);
  return next.toString();
}

export type UrlStateAction =
  /** A normal filter/search/page/item change from the UI. */
  | { type: "patch"; patch: Partial<UrlState> }
  /** Adopts a state wholesale, e.g. after the browser's back/forward button
   *  fires popstate. Never applies the page-reset rule below: the history
   *  entry being restored already encodes whatever page it had. */
  | { type: "replace"; state: UrlState };

/**
 * Any change other than paging or selecting an item resets the page to 1,
 * otherwise a filter change can land the reader on an empty page 3 with
 * nothing to show. Page and item are independent of everything else and of
 * each other: selecting an item does not reset the page, and paging does
 * not clear the selection.
 */
export function urlStateReducer(state: UrlState, action: UrlStateAction): UrlState {
  if (action.type === "replace") return action.state;

  const merged: UrlState = { ...state, ...action.patch };
  const onlyPageOrItem = Object.keys(action.patch).every((k) => k === "page" || k === "item");
  if (!onlyPageOrItem) merged.page = 1;
  return merged;
}
