"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDigestStream } from "@/hooks/use-digest-stream";
import { useUrlState } from "@/hooks/use-url-state";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useListKeyboardNav } from "@/hooks/use-list-keyboard-nav";
import { applyFilters } from "@/lib/digest/filter";
import { groupForList } from "@/lib/digest/group";
import { paginate, paginateGroups, pageContaining } from "@/lib/digest/paginate";
import { TopBar } from "./top-bar";
import { FilterSidebar } from "./filter-sidebar";
import { FilterSheet } from "./filter-sheet";
import { ItemList } from "./item-list";
import { ItemDetail } from "./item-detail";
import { EmptyDetailPanel } from "./empty-detail-panel";
import { DetailDialog } from "./detail-dialog";
import { DigestAlerts } from "./digest-alerts";
import { CacheNotice } from "./cache-notice";
import { SortControl, type SortBy } from "./sort-control";
import type { DigestResult } from "@/lib/types";

const PAGE_SIZE = 25;

/**
 * Layout shell only: owns URL state, the digest stream, and derives what
 * each region needs via the lib/ pure functions. It renders nothing about
 * filtering or grouping logic itself: TopBar, FilterSidebar and ItemList do
 * that from the props this hands them.
 */
export function DigestApp({ initialData }: { initialData: DigestResult | null }) {
  const { digest, liveSources, refreshing, runError, cacheAgeMs, refresh } =
    useDigestStream(initialData);
  const [state, setState] = useUrlState();
  const [sortBy, setSortBy] = useState<SortBy>("deadline");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  // Below xl the detail pane is a Dialog; at xl and up it's a persistent third
  // column. These are mutually exclusive, not just visually swapped: a Dialog
  // that merely *looks* hidden at desktop width still scroll-locks the page,
  // traps focus, and marks everything else aria-hidden for assistive tech, so
  // it must not mount at all once isDesktop is true.
  const isDesktop = useMediaQuery("(min-width: 1280px)");
  const lastFocusedRowRef = useRef<HTMLElement | null>(null);

  // One instant per digest, not per render, so re-filtering doesn't cause a
  // consultation to flip open/closed mid-interaction. `digest` is a
  // deliberate dependency the callback doesn't read, existing purely to
  // force a fresh Date() each time a new digest lands.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), [digest]);

  const scored = useMemo(() => digest?.scored ?? [], [digest]);
  const notRelevantSource = useMemo(() => digest?.notRelevant ?? [], [digest]);

  const filterResult = useMemo(
    () => applyFilters(scored, notRelevantSource, state, now),
    [scored, notRelevantSource, state, now],
  );

  const groups = useMemo(() => {
    if (state.view === "not_relevant") return null;
    const g = groupForList(filterResult.items, { now, sortBy });
    return [
      { key: "week", label: "Closes this week", rows: g.closingThisWeek },
      { key: "later", label: "Closes later", rows: g.closingLater },
      { key: "none", label: "No submission window", rows: g.noWindow },
    ];
  }, [filterResult.items, now, sortBy, state.view]);

  const pagedGroups = useMemo(
    () => (groups ? paginateGroups(groups, state.page, PAGE_SIZE) : null),
    [groups, state.page],
  );

  const notRelevantSorted = useMemo(() => {
    if (state.view !== "not_relevant") return [];
    return [...filterResult.notRelevantItems].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [filterResult.notRelevantItems, state.view]);

  const pagedNotRelevant = useMemo(
    () => paginate(notRelevantSorted, state.page, PAGE_SIZE),
    [notRelevantSorted, state.page],
  );

  // A `?item=` deep link jumps to the page that contains it, even if that
  // isn't page 1.
  useEffect(() => {
    if (!state.item || !groups) return;
    const targetPage = pageContaining(groups, PAGE_SIZE, (i) => i.id === state.item);
    if (targetPage && targetPage !== state.page) setState({ page: targetPage });
    // Only re-run when the target item or the candidate group contents change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.item, groups]);

  const selectedItem = useMemo(
    () => (state.item ? (scored.find((i) => i.id === state.item) ?? null) : null),
    [scored, state.item],
  );

  const handleSelect = useCallback(
    (id: string) => {
      // Captured explicitly rather than relying on the Dialog's own restore:
      // this dialog has no Dialog.Trigger (it opens from URL state, not a
      // click on it), which is what most focus-restore implementations key
      // off, so a manual capture/restore pair is the reliable path.
      lastFocusedRowRef.current = document.activeElement as HTMLElement | null;
      setState({ item: id });
    },
    [setState],
  );
  const closeDetail = useCallback(() => {
    setState({ item: undefined });
    lastFocusedRowRef.current?.focus();
  }, [setState]);

  useListKeyboardNav({ searchRef, hasSelection: Boolean(state.item), onEscape: closeDetail });

  const sidebarProps = {
    view: state.view,
    onViewChange: (view: typeof state.view) => setState({ view }),
    topics: state.topics,
    onTopicsChange: (topics: string[]) => setState({ topics }),
    sources: state.sources,
    onSourcesChange: (sources: string[]) => setState({ sources }),
    counts: filterResult.counts,
  };

  const loading = !digest && refreshing;
  const emptyMessage =
    state.view === "not_relevant"
      ? state.query
        ? `Nothing in "Not relevant" matches "${state.query}".`
        : "Nothing was filtered out this week."
      : state.query
        ? `No items match "${state.query}" in this view.`
        : state.view === "open"
          ? "Nothing has an open submission window right now."
          : "No startup-relevant items this week.";

  return (
    <div className="mx-auto flex h-dvh w-full min-w-0 max-w-[1920px] flex-col">
      <TopBar
        weekStart={digest?.weekStart}
        query={state.query}
        onQueryChange={(query) => setState({ query })}
        searchRef={searchRef}
        sources={liveSources}
        refreshing={refreshing}
        onRefresh={refresh}
        onOpenFilters={() => setFiltersOpen(true)}
      />

      <DigestAlerts runError={runError} onRetry={refresh} digest={digest} />

      {cacheAgeMs !== null && <CacheNotice ageMs={cacheAgeMs} />}

      <div className="flex min-h-0 min-w-0 flex-1">
        <aside className="hidden w-60 min-w-0 shrink-0 border-r border-border p-4 xl:flex xl:flex-col">
          <FilterSidebar {...sidebarProps} containSources />
        </aside>

        <main className="scroll-pane min-w-0 flex-1 overflow-y-auto">
          {state.view !== "not_relevant" && <SortControl value={sortBy} onChange={setSortBy} />}
          {state.view === "not_relevant" ? (
            <ItemList
              loading={loading}
              emptyMessage={emptyMessage}
              now={now}
              onPageChange={(page) => setState({ page })}
              notRelevant={{ paged: pagedNotRelevant }}
            />
          ) : (
            groups &&
            pagedGroups && (
              <ItemList
                loading={loading}
                emptyMessage={emptyMessage}
                now={now}
                onPageChange={(page) => setState({ page })}
                relevant={{
                  fullGroups: groups,
                  paged: pagedGroups,
                  selectedId: state.item,
                  onSelect: handleSelect,
                }}
              />
            )
          )}
        </main>

        {isDesktop && (
          <aside className="scroll-pane w-[420px] min-w-0 shrink-0 overflow-y-auto border-l border-border">
            {selectedItem ? (
              <ItemDetail item={selectedItem} now={now} llmAvailable={digest?.llmAvailable} />
            ) : (
              <EmptyDetailPanel digest={digest} now={now} onSelect={handleSelect} />
            )}
          </aside>
        )}
      </div>

      {/* Same reasoning as the detail dialog below: gated on isDesktop, not
          just the "Filters" trigger button's own xl:hidden, so a sheet left
          open while resizing past the breakpoint can't strand the page
          scroll-locked with the sidebar unreachable behind it. */}
      {!isDesktop && (
        <FilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} {...sidebarProps} />
      )}

      {!isDesktop && state.item && (
        <DetailDialog
          item={selectedItem}
          now={now}
          llmAvailable={digest?.llmAvailable}
          onClose={closeDetail}
        />
      )}
    </div>
  );
}
