"use client";

import { Popover } from "@base-ui/react/popover";
import { cn } from "cn";
import type { LiveSourceState } from "@/hooks/use-digest-stream";

const DOT: Record<LiveSourceState["status"], string> = {
  pending: "bg-muted-foreground/50 animate-pulse",
  ok: "bg-emerald-600",
  partial: "bg-amber-600",
  timeout: "bg-amber-600",
  error: "bg-red-600",
};

const WORD: Record<LiveSourceState["status"], string> = {
  pending: "still running",
  ok: "ok",
  partial: "partial",
  timeout: "timed out",
  error: "failed",
};

/**
 * One line of text, shared by the pill's own label and the plain copy the
 * top bar falls back to on narrow screens (see TopBar's More menu), so the
 * two never drift into disagreeing about source health.
 */
export function sourceStatusSummary(sources: LiveSourceState[]): { summary: string; failed: boolean } {
  const failed = sources.filter((s) => s.status === "error" || s.status === "timeout");
  const scanning = sources.some((s) => s.status === "pending");
  const doneCount = sources.filter((s) => s.status !== "pending").length;

  const summary = scanning
    ? `Scanning ${doneCount} of ${sources.length}`
    : failed.length > 0
      ? `${failed.length} source${failed.length === 1 ? "" : "s"} failed`
      : `${sources.length} of ${sources.length} sources ok`;

  return { summary, failed: failed.length > 0 };
}

/**
 * "14 of 100" is operational health, not the digest itself. This collapses
 * the 8 source chips that used to lead the page into one line and a popover,
 * so the reader's eye lands on the digest, not on scrape plumbing.
 */
export function SourceStatus({ sources }: { sources: LiveSourceState[] }) {
  const failed = sources.filter((s) => s.status === "error" || s.status === "timeout");
  const { summary } = sourceStatusSummary(sources);

  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn(
          "flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted",
          failed.length > 0 && "border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-400",
        )}
        aria-live="polite"
      >
        <span
          aria-hidden
          className={cn("size-1.5 rounded-full", failed.length > 0 ? "bg-amber-600" : "bg-emerald-600")}
        />
        {summary}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-50">
          <Popover.Popup className="w-72 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
            <table className="w-full text-xs">
              <tbody>
                {sources.map((s) => (
                  <tr key={s.source} className="border-b border-border last:border-b-0">
                    <td className="py-1.5 pr-2 align-top">
                      <span aria-hidden className={cn("inline-block size-1.5 rounded-full", DOT[s.status])} />
                    </td>
                    <td lang="lv" className="py-1.5 pr-2 align-top">
                      {s.label}
                    </td>
                    <td className="py-1.5 text-right align-top tabular-nums text-muted-foreground">
                      {s.status === "ok" || s.status === "partial" ? s.count : WORD[s.status]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
