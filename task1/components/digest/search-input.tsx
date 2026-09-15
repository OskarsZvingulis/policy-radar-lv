"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { cn } from "cn";

const DEBOUNCE_MS = 200;

/**
 * Local state drives what's on screen; the URL is only updated after a short
 * debounce. Binding the input's value straight to the URL-derived prop
 * looked simpler, but `router.replace` round-trips asynchronously, so a
 * controlled value driven by it lags behind fast typing and drops
 * characters as each keystroke re-renders against a still-stale prop. The
 * effect below only reconciles from genuinely external changes (back
 * button, a "clear filters" click). During normal typing the prop never
 * changes until the debounce itself fires, so it can't fight the user.
 */
export const SearchInput = forwardRef<
  HTMLInputElement,
  { value: string; onChange: (v: string) => void; className?: string }
>(function SearchInput({ value, onChange, className }, ref) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => () => clearTimeout(timer.current), []);

  function handleChange(next: string) {
    setLocal(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(next), DEBOUNCE_MS);
  }

  return (
    <div className={cn("relative min-w-0", className)}>
      <input
        ref={ref}
        type="search"
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search acts, topics, 26-TA-..."
        aria-label="Search the digest"
        className="h-9 w-full min-w-0 rounded-md border border-border bg-background px-3 pr-10 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {!local && (
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
