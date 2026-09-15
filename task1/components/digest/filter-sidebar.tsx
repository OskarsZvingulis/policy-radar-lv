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
}: {
  view: ViewId;
  onViewChange: (v: ViewId) => void;
  topics: string[];
  onTopicsChange: (t: string[]) => void;
  sources: string[];
  onSourcesChange: (s: string[]) => void;
  counts: FilterCounts;
}) {
  const hasActiveFilters = topics.length > 0 || sources.length > 0;

  function toggle(list: string[], id: string, set: (v: string[]) => void) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  return (
    <nav aria-label="Filters" className="flex flex-col gap-6 text-sm">
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
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-muted",
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
                  <label className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
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

      <section>
        <h2 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Sources</h2>
        <ul className="flex flex-col gap-0.5">
          {SOURCE_REGISTRY.map((s) => {
            const count = counts.bySource[s.id] ?? 0;
            const checked = sources.includes(s.id);
            return (
              <li key={s.id}>
                <label className="flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
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
          className="self-start"
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
