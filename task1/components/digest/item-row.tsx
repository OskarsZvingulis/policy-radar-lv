"use client";

import { cn } from "cn";
import type { NotRelevantItem, ScoredItem } from "@/lib/types";
import { absoluteDay } from "@/lib/relative-date";
import { displayTitle } from "@/lib/display-title";
import { hasOpenWindow } from "@/lib/digest/group";
import { matchedTopics, topicLabel } from "@/lib/digest/topics";
import { DeadlineBadge } from "./deadline-badge";

const MAX_TAGS = 3;

/**
 * One row in the list. Emphasis order matches what a reader decides on: the
 * date column first (the one thing worth scanning top to bottom), then the
 * title, then why it matched, then where it came from. Never a dot-joined
 * sentence, so the eye finds each piece in the same place on every row.
 */
export function ItemRow({
  item,
  selected,
  onSelect,
  now = new Date(),
}: {
  item: ScoredItem;
  selected: boolean;
  onSelect: () => void;
  now?: Date;
}) {
  const title = displayTitle(item.title);
  const open = hasOpenWindow(item, now);
  const dateIso = open ? item.deadline : item.date;
  const topics = matchedTopics(item.matchedRules).map(topicLabel);
  const visibleTopics = topics.slice(0, MAX_TAGS);
  const hiddenTopics = topics.length - visibleTopics.length;

  return (
    <button
      type="button"
      data-item-row
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
        selected && "border-l-2 border-l-foreground bg-muted",
      )}
    >
      <DeadlineBadge iso={dateIso} tinted={open} now={now} />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p lang="lv" className="text-sm leading-snug font-medium break-words text-foreground">
          {title.text}
        </p>

        {visibleTopics.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
            {visibleTopics.map((t, i) => (
              <span key={t}>
                {t}
                {i < visibleTopics.length - 1 || hiddenTopics > 0 ? " ·" : ""}
              </span>
            ))}
            {hiddenTopics > 0 && <span>+{hiddenTopics}</span>}
          </div>
        )}

        <p className="truncate text-xs text-muted-foreground">
          <span lang="lv">{item.sourceLabel}</span>
          {item.institution && (
            <>
              {" · "}
              <span lang="lv">{item.institution}</span>
            </>
          )}
        </p>
      </div>
    </button>
  );
}

/**
 * A row in the "Not relevant" audit view. No deadline column (these have no
 * submission window by definition of not surfacing). The useful fact per
 * row is why the rules skipped it, so that leads instead.
 */
export function NotRelevantRow({ item, now = new Date() }: { item: NotRelevantItem; now?: Date }) {
  const title = displayTitle(item.title);
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      data-item-row
      className="flex w-full items-start gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/60"
    >
      <div className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground sm:w-[4.5rem]">
        {absoluteDay(item.date, now)}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p lang="lv" className="text-sm leading-snug font-medium break-words text-foreground">
          {title.text}
        </p>
        <p className="text-xs text-muted-foreground">{item.reason}</p>
        <p className="truncate text-xs text-muted-foreground" lang="lv">
          {item.sourceLabel}
        </p>
      </div>
    </a>
  );
}
