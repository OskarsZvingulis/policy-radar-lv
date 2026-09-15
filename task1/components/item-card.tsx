"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ScoredItem } from "@/lib/types";
import { describeItemDates } from "@/lib/dates";
import { displayTitle } from "@/lib/display-title";
import { deadlinePhrase, pastPhrase } from "@/lib/relative-date";

const MAX_VISIBLE_AXES = 3;

/**
 * One item, ordered by what a founder decides on: what it is, by when, on
 * what grounds, and only then where it came from and how strongly it scored.
 *
 * Colour is spent on exactly one thing — an open deadline. Everything that
 * was previously coloured (urgency borders, score emphasis) competed with it
 * and left the page with no focal point.
 *
 * Collapsed by default: the full Latvian legal title runs to five lines and
 * buries the next card. It stays one click away rather than being discarded.
 */
export function ItemCard({ item }: { item: ScoredItem }) {
  const [expanded, setExpanded] = useState(false);
  const title = displayTitle(item.title);
  const dates = describeItemDates(item);
  // describeItemDates only marks a window `isDeadline` while it is still open,
  // so the red line below can never render a date nobody can act on. A closed
  // window comes back as ordinary context instead.
  const deadline = item.actionable ? dates.find((d) => d.isDeadline) : undefined;
  const context = dates.filter((d) => d !== deadline);
  const otherWindows = (item.appearances ?? []).filter(
    (a) => a.deadline && a.url !== item.url,
  );

  const axes = item.matchedRules;
  const visibleAxes = expanded ? axes : axes.slice(0, MAX_VISIBLE_AXES);
  const hiddenAxes = axes.length - visibleAxes.length;

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-4">
        {/* lang="lv" so a screen reader uses Latvian pronunciation rules for
            the title rather than reading it as mangled English. */}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          lang="lv"
          className="text-balance font-heading text-base leading-snug font-medium hover:underline"
        >
          {title.text}
        </a>

        {deadline && (
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            {deadline.label}: {deadlinePhrase(deadline.iso)}
          </p>
        )}

        {item.whyItMatters && <p className="text-sm">{item.whyItMatters}</p>}

        {visibleAxes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {visibleAxes.map((axis) => (
              <Badge key={axis} variant="outline" className="font-normal">
                {axis}
              </Badge>
            ))}
            {hiddenAxes > 0 && (
              <span className="self-center text-xs text-muted-foreground">+{hiddenAxes} more</span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span lang="lv">{item.sourceLabel}</span>
          {item.institution && (
            <>
              <span aria-hidden>·</span>
              <span lang="lv">{item.institution}</span>
            </>
          )}
          {item.stage && (
            <>
              <span aria-hidden>·</span>
              <span lang="lv">{item.stage}</span>
            </>
          )}
          {context.map((d) => (
            <span key={d.label} className="flex items-center gap-2">
              <span aria-hidden>·</span>
              <span>
                {d.label} {pastPhrase(d.iso)}
              </span>
            </span>
          ))}
          <span aria-hidden>·</span>
          <span className="tabular-nums">relevance {item.score}</span>
          {(title.shortened || axes.length > 0) && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="ml-auto -m-2 p-2 underline underline-offset-2 hover:text-foreground"
            >
              {expanded ? "Less" : "Details"}
            </button>
          )}
        </div>

        {expanded && (
          <div className="flex flex-col gap-2 border-t pt-2 text-xs text-muted-foreground">
            {title.shortened && (
              <p>
                <span className="font-medium text-foreground">Full title: </span>
                <span lang="lv">{item.title}</span>
              </p>
            )}
            {otherWindows.length > 0 && (
              <div>
                <span className="font-medium text-foreground">Other dates for this act: </span>
                <ul className="mt-0.5 flex flex-col gap-0.5">
                  {otherWindows.map((a) => (
                    <li key={a.url}>
                      {a.sourceLabel}: {deadlinePhrase(a.deadline!)}{" "}
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2"
                      >
                        open
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {item.alsoSeenIn && item.alsoSeenIn.length > 0 && otherWindows.length === 0 && (
              <p>Also listed by: {item.alsoSeenIn.join(", ")}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
