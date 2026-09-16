"use client";

import { closingSoonest, groupDigest } from "@/lib/digest/group";
import { displayTitle } from "@/lib/display-title";
import { deadlinePhrase, pastPhrase } from "@/lib/relative-date";
import type { DigestResult } from "@/lib/types";

/**
 * What the detail pane shows before anything is selected. A single centred
 * sentence left the whole column a permanently empty rectangle; this earns
 * its space with the same "30 seconds" summary the markdown export leads
 * with, reusing groupDigest/closingSoonest rather than recomputing that
 * split a third time. Deliberately just a top-3 shortcut, not the list
 * itself: the full "Closes this week" group is already one column over.
 */
export function EmptyDetailPanel({
  digest,
  now,
  onSelect,
}: {
  digest: DigestResult | null;
  now: Date;
  onSelect: (id: string) => void;
}) {
  if (!digest) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Select an item to see deadlines and details.
      </div>
    );
  }

  const { open, awareness } = groupDigest(digest.scored, { now });
  const soonest = closingSoonest(digest.scored, { now, limit: 3 });

  return (
    <div className="flex h-full flex-col gap-4 p-4 text-sm">
      <p className="text-muted-foreground">Select an item to see deadlines and details.</p>

      <dl className="grid grid-cols-3 gap-2 rounded-md border border-border py-3 text-center">
        <div>
          <dd className="text-lg font-semibold tabular-nums">{open.length}</dd>
          <dt className="text-xs text-muted-foreground">open</dt>
        </div>
        <div>
          <dd className="text-lg font-semibold tabular-nums">{awareness.length}</dd>
          <dt className="text-xs text-muted-foreground">worth knowing</dt>
        </div>
        <div>
          <dd className="text-lg font-semibold tabular-nums">{digest.notRelevant.length}</dd>
          <dt className="text-xs text-muted-foreground">not relevant</dt>
        </div>
      </dl>

      {soonest.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Closing soonest
          </h3>
          <ul className="flex flex-col">
            {soonest.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="flex w-full min-w-0 items-baseline gap-2 rounded px-1 py-1.5 text-left hover:bg-muted"
                >
                  <span className="shrink-0 text-xs font-medium text-red-700 dark:text-red-400">
                    {deadlinePhrase(item.deadline!, now)}
                  </span>
                  <span lang="lv" className="min-w-0 truncate">
                    {displayTitle(item.title).text}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-auto border-t border-border pt-2 text-xs text-muted-foreground">
        Last scan {pastPhrase(digest.generatedAt, now)}
      </p>
    </div>
  );
}
