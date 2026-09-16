"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ScoredItem } from "@/lib/types";
import { displayTitle } from "@/lib/display-title";
import { describeItemDates } from "@/lib/dates";
import { deadlinePhrase, pastPhrase } from "@/lib/relative-date";
import { matchedTopics, topicLabel } from "@/lib/digest/topics";
import { DeadlineTimeline } from "./deadline-timeline";

/** Title, deadline (if any), source and link, as plain text for pasting into Slack or email. */
function buildSummary(item: ScoredItem, now: Date): string {
  const lines = [displayTitle(item.title).text];
  if (item.actionable && item.deadline) {
    const dates = describeItemDates(item, now);
    const label = dates.find((d) => d.isDeadline)?.label ?? "Deadline";
    lines.push(`${label}: ${deadlinePhrase(item.deadline, now)}`);
  }
  lines.push(item.sourceLabel, item.url);
  return lines.join("\n");
}

/**
 * Everything a card kept behind "Details" now lives here permanently: the
 * full title, every deadline this act carries, and the reasoning. Emphasis
 * order matches the card's: title, then deadlines, then why it matters, then
 * source metadata, then the raw relevance score last (a number that used to
 * lead every card, when it answers none of the three questions this page
 * exists to answer).
 */
export function ItemDetail({
  item,
  now = new Date(),
  llmAvailable = true,
}: {
  item: ScoredItem | null;
  now?: Date;
  llmAvailable?: boolean;
}) {
  const [showFull, setShowFull] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  async function handleCopySummary() {
    if (!item) return;
    try {
      await navigator.clipboard.writeText(buildSummary(item, now));
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied (permissions, insecure context); the
      // confirmation simply never appears rather than throwing at the user.
    }
  }

  if (!item) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Select an item to see deadlines and details.
      </div>
    );
  }

  const title = displayTitle(item.title);
  const dates = describeItemDates(item, now);
  const context = dates.filter((d) => !d.isDeadline);
  const topics = matchedTopics(item.matchedRules).map(topicLabel);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          render={
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              <span lang="lv">Open on {item.sourceLabel}</span>
            </a>
          }
        />
        <Button variant="outline" size="sm" onClick={handleCopySummary} aria-live="polite">
          {copied ? "Copied" : "Copy summary"}
        </Button>
      </div>

      <div>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          lang="lv"
          className="text-base leading-snug font-semibold break-words hover:underline"
        >
          {title.text}
        </a>
        {title.shortened && (
          <button
            type="button"
            onClick={() => setShowFull((v) => !v)}
            className="mt-1 block text-xs text-muted-foreground underline underline-offset-2"
          >
            {showFull ? "Hide full title" : "Show full title"}
          </button>
        )}
        {showFull && (
          <p lang="lv" className="mt-2 text-xs break-words text-muted-foreground">
            {item.title}
          </p>
        )}
      </div>

      {item.appearances && item.appearances.length > 1 ? (
        <section>
          <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Deadlines</h3>
          <DeadlineTimeline appearances={item.appearances} now={now} />
        </section>
      ) : (
        item.actionable &&
        item.deadline && (
          <section>
            <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Deadline</h3>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              {dates.find((d) => d.isDeadline)?.label}: {pastPhrase(item.deadline, now)}
            </p>
          </section>
        )
      )}

      <section>
        <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {item.whyItMatters ? "Why it matters" : "Matched rules"}
        </h3>
        {item.whyItMatters ? (
          <p className="text-sm">{item.whyItMatters}</p>
        ) : item.matchedRules.length > 0 ? (
          <p className="text-sm text-muted-foreground">{item.matchedRules.join(", ")}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No rules matched directly.</p>
        )}
      </section>

      {topics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {topics.map((t) => (
            <Badge key={t} variant="outline" className="font-normal">
              {t}
            </Badge>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-1 border-t border-border pt-3 text-xs text-muted-foreground">
        <span lang="lv">{item.sourceLabel}</span>
        {item.institution && <span lang="lv">{item.institution}</span>}
        {item.stage && <span lang="lv">{item.stage}</span>}
        {context.map((d) => (
          <span key={d.label}>
            {d.label}: {pastPhrase(d.iso, now)}
          </span>
        ))}
        {item.alsoSeenIn && item.alsoSeenIn.length > 0 && (
          <span lang="lv">Also listed by: {item.alsoSeenIn.join(", ")}</span>
        )}
        <span className="tabular-nums">Relevance score: {item.score}/100</span>
        {!llmAvailable && <span>Explanations: rules-based</span>}
      </section>
    </div>
  );
}
