"use client";

import Link from "next/link";
import { Popover } from "@base-ui/react/popover";
import { Button } from "@/components/ui/button";
import { SearchInput } from "./search-input";
import { SourceStatus } from "./source-status";
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
  return (
    <header className="flex min-w-0 flex-col gap-2 border-b border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="flex items-center justify-between gap-3 sm:justify-start">
        <div className="flex items-baseline gap-2">
          <h1 className="font-heading text-lg font-semibold">Policy Radar LV</h1>
          {weekStart && (
            <span className="text-xs text-muted-foreground">Week of {absoluteDay(weekStart)}</span>
          )}
        </div>
        {onOpenFilters && (
          <Button variant="outline" size="sm" className="xl:hidden" onClick={onOpenFilters}>
            Filters
          </Button>
        )}
      </div>

      <SearchInput value={query} onChange={onQueryChange} ref={searchRef} className="sm:max-w-sm sm:flex-1" />

      <div className="flex items-center gap-2 sm:ml-auto">
        <SourceStatus sources={sources} />
        <Button onClick={onRefresh} disabled={refreshing} size="sm">
          {refreshing ? "Scanning…" : "Refresh"}
        </Button>
        <Popover.Root>
          <Popover.Trigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label="More">
                <MoreIcon />
              </Button>
            }
          />
          <Popover.Portal>
            <Popover.Positioner sideOffset={8} align="end" className="z-50">
              <Popover.Popup className="flex w-48 flex-col rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md">
                <Link href="/methodology" className="rounded px-2 py-1.5 hover:bg-muted">
                  Methodology
                </Link>
                <a
                  href="/api/digest/markdown"
                  target="_blank"
                  className="rounded px-2 py-1.5 hover:bg-muted"
                >
                  Export as Markdown
                </a>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>
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
