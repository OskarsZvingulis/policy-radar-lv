"use client";

import { useCallback, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { DEFAULT_FILTER_STATE, type FilterState, type ViewId } from "@/lib/digest/filter";

export interface UrlState extends FilterState {
  page: number;
  /** Id of the selected item, if any. Deep-links a single row. */
  item?: string;
}

const VALID_VIEWS: ViewId[] = ["open", "all", "not_relevant"];

function parseView(raw: string | null): ViewId {
  return VALID_VIEWS.includes(raw as ViewId) ? (raw as ViewId) : DEFAULT_FILTER_STATE.view;
}

function splitParam(raw: string | null): string[] {
  return raw ? raw.split(",").filter(Boolean) : [];
}

/**
 * Every filter, the page, and the selected item live in the URL rather than
 * component state: the acceptance criteria call for each to survive a
 * reload and for the whole view to be shareable as a link, and a URL is the
 * only state a link can carry.
 */
export function useUrlState(): [UrlState, (patch: Partial<UrlState>) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const state: UrlState = useMemo(
    () => ({
      view: parseView(params.get("view")),
      topics: splitParam(params.get("topic")),
      sources: splitParam(params.get("source")),
      query: params.get("q") ?? "",
      page: Math.max(1, Number(params.get("page")) || 1),
      item: params.get("item") ?? undefined,
    }),
    [params],
  );

  const setState = useCallback(
    (patch: Partial<UrlState>) => {
      const merged: UrlState = { ...state, ...patch };
      // Any change other than paging or selecting an item invalidates the
      // current page, otherwise a filter can land the reader on an empty
      // page 3 with nothing to show and no obvious way out.
      const onlyPageOrItem = Object.keys(patch).every((k) => k === "page" || k === "item");
      if (!onlyPageOrItem) merged.page = 1;

      const next = new URLSearchParams();
      if (merged.view !== DEFAULT_FILTER_STATE.view) next.set("view", merged.view);
      if (merged.topics.length > 0) next.set("topic", merged.topics.join(","));
      if (merged.sources.length > 0) next.set("source", merged.sources.join(","));
      if (merged.query) next.set("q", merged.query);
      if (merged.page > 1) next.set("page", String(merged.page));
      if (merged.item) next.set("item", merged.item);

      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [state, router, pathname],
  );

  return [state, setState];
}
