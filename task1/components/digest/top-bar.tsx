"use client";

import Link from "next/link";
import { Popover } from "@base-ui/react/popover";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { SearchInput } from "./search-input";
import { SourceStatus, sourceStatusSummary } from "./source-status";
import { absoluteDay } from "@/lib/relative-date";
import type { LiveSourceState } from "@/hooks/use-digest-stream";
import type { RefObject } from "react";

/**
 * One row: product identity, search, source health, and refresh. Methodology
 * and the Markdown export used to sit as prominent links under the header;
 * they matter to almost nobody on a weekly visit, so they move into a small
 * menu here instead of competing with the digest for attention.
 */
export function TopBar({
  weekStart,
  query,
  onQueryChange,
  searchRef,
  sources,
  refreshing,
  onRefresh,
  onOpenFilters,
}: {
  weekStart?: string;
  query: string;
  onQueryChange: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  sources: LiveSourceState[];
  refreshing: boolean;
  onRefresh: () => void;
  onOpenFilters?: () => void;
}) {
  const status = sourceStatusSummary(sources);

  return (
    <header className="flex min-w-0 flex-col gap-2 border-b border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      {/* On phones this is the whole first row: name on the left, every
          action on the right, so the bar never grows past two rows (this one
          plus search below). At sm and up `contents` un-boxes it so its two
          children rejoin the header's own row in their original order
          (name, search, actions) via the order-* classes below, leaving the
          tablet/desktop layout exactly as it was. */}
      <div className="flex items-center justify-between gap-3 sm:contents">
        <div className="flex items-baseline gap-2 sm:order-1">
          <h1 className="font-heading text-lg font-semibold">Policy Radar LV</h1>
          {weekStart && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Week of {absoluteDay(weekStart)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:order-3 sm:ml-auto">
          {onOpenFilters && (
            // Below xl this is the only way to reach the filter sheet at all
            // (there's no persistent column to fall back to), so it keeps
            // its full 44px touch target for as long as it's on screen,
            // rather than shrinking at sm the way Refresh and More do.
            <Button
              variant="outline"
              size="sm"
              className="h-11 min-w-11 gap-1.5 xl:hidden"
              onClick={onOpenFilters}
            >
              <FilterIcon />
              <span className="sr-only sm:not-sr-only">Filters</span>
            </Button>
          )}
          <div className="hidden sm:block">
            <SourceStatus sources={sources} />
          </div>
          <Button
            onClick={onRefresh}
            disabled={refreshing}
            size="sm"
            className="h-11 min-w-11 gap-1.5 xl:h-8 xl:min-w-0"
          >
            <RefreshIcon className={refreshing ? "animate-spin" : undefined} />
            <span className="sr-only sm:not-sr-only">{refreshing ? "Scanning…" : "Refresh"}</span>
          </Button>
          <Popover.Root>
            <Popover.Trigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="More"
                  className="h-11 min-w-11 xl:h-7 xl:min-w-0 xl:size-7"
                >
                  <MoreIcon />
                </Button>
              }
            />
            <Popover.Portal>
              <Popover.Positioner sideOffset={8} align="end" className="z-50">
                <Popover.Popup className="flex w-56 flex-col rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md">
                  {/* Collapsed here on phones, where the week label and the
                      status pill above got dropped from the top bar to keep
                      it to two rows. */}
                  <div className="border-b border-border px-2 py-1.5 text-xs text-muted-foreground sm:hidden">
                    {weekStart && <p>Week of {absoluteDay(weekStart)}</p>}
                    <p className={cn(status.failed && "text-amber-700 dark:text-amber-400")}>{status.summary}</p>
                  </div>
                  <Link href="/methodology" className="rounded px-2 py-1.5 hover:bg-muted">
                    Methodology
                  </Link>
                  <a
                    href="/api/digest/markdown"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded px-2 py-1.5 hover:bg-muted"
                  >
                    Export as Markdown
                  </a>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </div>

      <SearchInput
        value={query}
        onChange={onQueryChange}
        ref={searchRef}
        className="sm:order-2 sm:max-w-sm sm:flex-1"
      />
    </header>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className="size-4">
      <circle cx="8" cy="3" r="1.3" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="8" cy="13" r="1.3" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden className="size-4">
      <path d="M2 3.5h12M4.5 8h7M7 12.5h2" strokeLinecap="round" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden
      className={cn("size-4", className)}
    >
      <path
        d="M13 8a5 5 0 1 1-1.5-3.6M13 2v3h-3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
