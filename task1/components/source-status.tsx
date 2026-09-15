import { Badge } from "@/components/ui/badge";
import type { SourceResult } from "@/lib/types";

export type LiveStatus = SourceResult["status"] | "pending";

export interface LiveSourceState {
  source: string;
  label: string;
  status: LiveStatus;
  count?: number;
  durationMs?: number;
  error?: string;
}

/**
 * Status is carried by a glyph and a word, not by the colour of a dot.
 * Colour stays as reinforcement — roughly one in twelve men cannot use it as
 * the signal, and this row is the only place the page says whether the data
 * it is showing is complete.
 */
const MARK: Record<LiveStatus, { glyph: string; tone: string; word: string }> = {
  pending: { glyph: "·", tone: "text-muted-foreground animate-pulse", word: "still running" },
  ok: { glyph: "✓", tone: "text-emerald-700 dark:text-emerald-400", word: "ok" },
  error: { glyph: "✕", tone: "text-red-700 dark:text-red-400", word: "failed" },
  timeout: { glyph: "!", tone: "text-amber-700 dark:text-amber-400", word: "timed out" },
  partial: { glyph: "~", tone: "text-amber-700 dark:text-amber-400", word: "partial" },
};

export function SourceStatusRow({
  sources,
  surfacedBySource,
}: {
  sources: LiveSourceState[];
  /** Items this source contributed to the digest, keyed by source id. */
  surfacedBySource?: Record<string, number>;
}) {
  return (
    // aria-live so a scan in progress is announced as sources land, not only
    // shown. This row is the page's only signal that anything is happening.
    <div
      className="flex flex-wrap gap-2"
      aria-live="polite"
      aria-busy={sources.some((s) => s.status === "pending")}
    >
      {sources.map((s) => {
        const mark = MARK[s.status];
        // A successful fetch that parsed nothing is not the same as a source
        // that is simply quiet this week, and the reader cannot tell them
        // apart from a bare "0" — say so rather than showing a green tick.
        const empty = s.status === "ok" && s.count === 0;
        const surfaced = surfacedBySource?.[s.source];

        return (
          <Badge key={s.source} variant="outline" title={s.error} className="gap-1.5 font-normal">
            <span aria-hidden className={mark.tone}>
              {empty ? "!" : mark.glyph}
            </span>
            <span className="sr-only">{empty ? "returned nothing" : mark.word}:</span>
            <span lang="lv">{s.label}</span>
            {s.status === "ok" &&
              (empty ? (
                <span className="text-amber-700 dark:text-amber-400">nothing returned</span>
              ) : (
                <span className="tabular-nums text-muted-foreground">
                  {surfaced ?? 0} of {s.count}
                </span>
              ))}
            {s.status === "partial" && (
              <span className="text-amber-700 dark:text-amber-400">
                partial, {surfaced ?? 0} of {s.count}
              </span>
            )}
            {s.status === "timeout" && (
              <span className="text-amber-700 dark:text-amber-400">timed out</span>
            )}
            {s.status === "error" && <span className="text-red-700 dark:text-red-400">failed</span>}
          </Badge>
        );
      })}
    </div>
  );
}
