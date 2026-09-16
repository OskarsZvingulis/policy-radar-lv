"use client";

import { forwardRef } from "react";
import { cn } from "cn";

/**
 * A plain controlled input. This used to keep its own local state and debounce
 * calling `onChange`, because the old URL-derived `value` prop updated
 * asynchronously (router.replace round-tripped through the server) and would
 * otherwise reset mid-type and drop characters. use-url-state.ts now holds
 * `query` as ordinary React state and updates it synchronously on every
 * keystroke (only the resulting address-bar write is debounced, over there),
 * so `value` never lags behind what was just typed and this component no
 * longer needs a debounce of its own.
 */
export const SearchInput = forwardRef<
  HTMLInputElement,
  { value: string; onChange: (v: string) => void; className?: string }
>(function SearchInput({ value, onChange, className }, ref) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search acts, topics, 26-TA-..."
        aria-label="Search the digest"
        className="h-11 w-full min-w-0 rounded-md border border-border bg-background px-3 pr-10 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 xl:h-9 xl:text-sm"
      />
      {!value && (
        <kbd
          aria-hidden
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground"
        >
          /
        </kbd>
      )}
    </div>
  );
});
