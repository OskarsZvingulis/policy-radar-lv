"use client";

import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { TOPIC_GROUPS } from "@/lib/digest/topics";
import { SOURCE_REGISTRY } from "@/lib/digest/registry";
import type { FilterCounts } from "@/lib/digest/filter";
import type { ViewId } from "@/lib/digest/filter";

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "open", label: "Open for input" },
  { id: "all", label: "All relevant" },
  { id: "not_relevant", label: "Not relevant" },
];

/**
 * The filter controls themselves, with no opinion on where they're mounted:
 * the persistent desktop column and the mobile bottom sheet both render this
 * same content, per the review's "reuses the sidebar parts" instruction.
 */
export function FilterSidebar({
  view,
  onViewChange,
  topics,
  onTopicsChange,
  sources,
  onSourcesChange,
  counts,
  containSources = false,
}: {
  view: ViewId;
  onViewChange: (v: ViewId) => void;
  topics: string[];
  onTopicsChange: (t: string[]) => void;
  sources: string[];
  onSourcesChange: (s: string[]) => void;
  counts: FilterCounts;
  /** Desktop's persistent column has a fixed height and room to spare, so View
   * and Topics should stay fully visible and only the Sources list scrolls
   * within it. The mobile bottom sheet has no such fixed height (it sizes to
   * content up to 85vh and scrolls as a whole), so it keeps the plain
   * stacked layout instead. */
  containSources?: boolean;
}) {
  const hasActiveFilters = topics.length > 0 || sources.length > 0;

  // A dedupe-merged act counts toward every source it appeared in (see
  // sourcesOf in lib/digest/filter.ts), so the source counts can add up to
  // more than the number of rows actually in this view. Flagged here rather
  // than silently, since a reader doing the arithmetic would otherwise
  // reasonably conclude the counts were wrong.
  const viewTotal = view === "open" ? counts.open : view === "all" ? counts.all : counts.notRelevant;
  const sourceCountsOverlap =
    view !== "not_relevant" &&
    Object.values(counts.bySource).reduce((sum, n) => sum + n, 0) > viewTotal;

  function toggle(list: string[], id: string, set: (v: string[]) => void) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  return (
    <nav
      aria-label="Filters"
      className={cn("flex flex-col gap-4 text-sm", containSources && "h-full min-h-0")}
    >
      <section>
        <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">View</h2>
        <ul className="flex flex-col gap-0.5">
          {VIEWS.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => onViewChange(v.id)}
                aria-pressed={view === v.id}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                  !containSources && "min-h-11",
                  view === v.id && "bg-muted font-medium text-foreground",
                )}
              >
                <span>{v.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {v.id === "open" ? counts.open : v.id === "all" ? counts.all : counts.notRelevant}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {view !== "not_relevant" && (
        <section>
          <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Topics</h2>
          <ul className="flex flex-col gap-0.5">
            {TOPIC_GROUPS.map((t) => {
              const count = counts.byTopic[t.id] ?? 0;
              const checked = topics.includes(t.id);
              return (
                <li key={t.id}>
                  <label
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted",
                      !containSources && "min-h-11",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(topics, t.id, onTopicsChange)}
                      className="size-4 accent-foreground"
                    />
                    <span className="flex-1">{t.label}</span>
                    <span className="tabular-nums text-muted-foreground">{count}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className={cn(containSources && "flex min-h-0 flex-1 flex-col")}>
        <h2
          className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
          title={
            sourceCountsOverlap
              ? "Counts can add up to more than the total shown for View: an act listed on more than one source (a public consultation that is also a draft act, for example) is counted under each of them."
              : undefined
          }
        >
          Sources
          {sourceCountsOverlap && (
            <>
              <span aria-hidden> *</span>
              <span className="sr-only">
                {" "}
                (counts can add up to more than the total: an act listed on more than one source is counted
                under each)
              </span>
            </>
          )}
        </h2>
        <ul className={cn("flex flex-col gap-0.5", containSources && "scroll-pane min-h-0 flex-1 overflow-y-auto")}>
          {SOURCE_REGISTRY.map((s) => {
            const count = counts.bySource[s.id] ?? 0;
            const checked = sources.includes(s.id);
            return (
              <li key={s.id}>
                <label
                  className={cn(
                    "flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted",
                    !containSources && "min-h-11",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(sources, s.id, onSourcesChange)}
                    className="mt-0.5 size-4 accent-foreground"
                  />
                  <span lang="lv" className="flex-1">
                    {s.label}
                  </span>
                  <span className="tabular-nums text-muted-foreground">{count}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          className={cn("shrink-0 self-start", !containSources && "h-11 min-w-11")}
          onClick={() => {
            onTopicsChange([]);
            onSourcesChange([]);
          }}
        >
          Clear filters
        </Button>
      )}
    </nav>
  );
}
