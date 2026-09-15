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
  const deadline = dates.find((d) => d.isDeadline);
  const context = dates.find((d) => !d.isDeadline);

  const axes = item.matchedRules;
  const visibleAxes = expanded ? axes : axes.slice(0, MAX_VISIBLE_AXES);
  const hiddenAxes = axes.length - visibleAxes.length;

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-4">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-balance font-heading text-base leading-snug font-medium hover:underline"
        >
          {title.text}
        </a>

        {deadline && (
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            {deadline.label} — {deadlinePhrase(deadline.iso)}
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
          <span>{item.sourceLabel}</span>
          {item.institution && (
            <>
              <span aria-hidden>·</span>
              <span>{item.institution}</span>
            </>
          )}
          {item.stage && (
            <>
              <span aria-hidden>·</span>
              <span>{item.stage}</span>
            </>
          )}
          {context && (
            <>
              <span aria-hidden>·</span>
              <span>
                {context.label} {pastPhrase(context.iso)}
              </span>
            </>
          )}
          <span aria-hidden>·</span>
          <span className="tabular-nums">relevance {item.score}</span>
          {(title.shortened || axes.length > 0) && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="ml-auto underline underline-offset-2 hover:text-foreground"
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
                {item.title}
              </p>
            )}
            {item.alsoSeenIn && item.alsoSeenIn.length > 0 && (
              <p>Also listed by: {item.alsoSeenIn.join(", ")}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
