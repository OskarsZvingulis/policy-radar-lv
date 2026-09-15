"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useDigestStream } from "@/hooks/use-digest-stream";
import { useUrlState } from "@/hooks/use-url-state";
import { applyFilters } from "@/lib/digest/filter";
import { groupForList } from "@/lib/digest/group";
import { paginate, paginateGroups, pageContaining } from "@/lib/digest/paginate";
import type { DigestResult } from "@/lib/types";
import { TopBar } from "./top-bar";
import { FilterSidebar } from "./filter-sidebar";
import { FilterSheet } from "./filter-sheet";
import { ItemList } from "./item-list";
import { ItemDetail } from "./item-detail";

const PAGE_SIZE = 25;

function minutesAgo(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "moments ago";
  return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
}

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
  const [sortBy, setSortBy] = useState<"deadline" | "relevance">("deadline");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

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

  const degraded = useMemo(
    () => (digest?.sources ?? []).filter((s) => s.status !== "ok" || s.count === 0),
    [digest],
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

  const handleSelect = useCallback((id: string) => setState({ item: id }), [setState]);
  const closeDetail = useCallback(() => setState({ item: undefined }), [setState]);

  // Keyboard nav: "/" focuses search, j/k or arrows move focus between rows
  // (native <button> semantics then make Enter/Space open them, no separate
  // Enter handler needed), Escape closes the open detail.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "Escape") {
        if (state.item) closeDetail();
        else if (typing) target.blur();
        return;
      }
      if (typing) return;
      if (e.key !== "j" && e.key !== "k" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

      const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-item-row]"));
      if (rows.length === 0) return;
      e.preventDefault();
      const current = rows.indexOf(document.activeElement as HTMLElement);
      const dir = e.key === "j" || e.key === "ArrowDown" ? 1 : -1;
      const next = current === -1 ? 0 : Math.min(Math.max(current + dir, 0), rows.length - 1);
      rows[next].focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.item, closeDetail]);

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

      {runError && (
        <Alert variant="destructive" className="m-3 rounded-md">
          <AlertTitle>Scan did not complete</AlertTitle>
          <AlertDescription>
            {runError}{" "}
            <button onClick={refresh} className="underline underline-offset-4">
              Try again
            </button>
          </AlertDescription>
        </Alert>
      )}

      {digest && degraded.length > 0 && (
        <Alert variant="destructive" className="m-3 rounded-md">
          <AlertTitle>
            This digest is incomplete: {degraded.length} of {digest.sources.length} sources did not deliver
          </AlertTitle>
          <AlertDescription>
            Items from {degraded.map((s) => s.label).join(", ")} are missing below.
          </AlertDescription>
        </Alert>
      )}

      {cacheAgeMs !== null && (
        <p className="px-3 pt-2 text-xs text-muted-foreground">
          Showing results from {minutesAgo(cacheAgeMs)}. The sources are only re-scanned every few minutes.
        </p>
      )}

      <div className="flex min-h-0 min-w-0 flex-1">
        <aside className="hidden w-60 min-w-0 shrink-0 overflow-y-auto border-r border-border p-4 xl:block">
          <FilterSidebar {...sidebarProps} />
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          {state.view !== "not_relevant" && (
            <div className="flex items-center justify-end gap-2 border-b border-border px-4 py-1.5 text-xs">
              <label htmlFor="sort-by" className="text-muted-foreground">
                Sort by
              </label>
              <select
                id="sort-by"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "deadline" | "relevance")}
                className="rounded border border-border bg-background px-1.5 py-0.5"
              >
                <option value="deadline">deadline</option>
                <option value="relevance">relevance</option>
              </select>
            </div>
          )}
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

        <aside className="hidden w-[420px] min-w-0 shrink-0 overflow-y-auto border-l border-border xl:block">
          <ItemDetail item={selectedItem} now={now} llmAvailable={digest?.llmAvailable} />
        </aside>
      </div>

      <FilterSheet open={filtersOpen} onOpenChange={setFiltersOpen} {...sidebarProps} />

      {/* Below xl, a selected item opens as a full-screen overlay instead of a
          persistent third column, since there isn't room for three panes. */}
      <Dialog.Root open={Boolean(state.item)} onOpenChange={(open) => !open && closeDetail()}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/40 xl:hidden" />
          <Dialog.Popup className="fixed inset-0 z-50 overflow-y-auto bg-background xl:hidden md:inset-6 md:rounded-lg md:border md:border-border md:shadow-lg">
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-background px-4 py-2">
              <Dialog.Title className="text-sm font-medium">Details</Dialog.Title>
              <Dialog.Close className="rounded px-2 py-1 text-sm underline underline-offset-2">
                Back
              </Dialog.Close>
            </div>
            <ItemDetail item={selectedItem} now={now} llmAvailable={digest?.llmAvailable} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
