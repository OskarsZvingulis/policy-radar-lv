import { cn } from "cn";
import type { Appearance } from "@/lib/types";
import { urgencyOf } from "@/lib/digest/urgency";
import { deadlinePhrase, absoluteDay } from "@/lib/relative-date";

const DOT: Record<ReturnType<typeof urgencyOf>, string> = {
  today: "bg-red-600",
  week: "bg-amber-600",
  later: "bg-foreground",
  none: "bg-muted-foreground",
};

/**
 * Every listing of one act, each with its own deadline and link. The direct
 * payoff of B1's fix keeping every appearance instead of discarding all but
 * one. A reader who only sees the card's lead deadline never learns a second
 * date exists at all; this is where that second date lives.
 */
export function DeadlineTimeline({ appearances, now = new Date() }: { appearances: Appearance[]; now?: Date }) {
  const withDates = appearances.filter((a) => a.deadline);
  if (withDates.length === 0) return null;

  const sorted = [...withDates].sort(
    (a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime(),
  );

  return (
    <ul className="flex flex-col gap-2">
      {sorted.map((a) => {
        const urgency = a.actionable ? urgencyOf(a.deadline, now) : "none";
        return (
          <li key={a.url} className="flex items-start gap-2 text-sm">
            <span aria-hidden className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", DOT[urgency])} />
            <div className="flex min-w-0 flex-col">
              <span className="tabular-nums">
                {absoluteDay(a.deadline!, now)}
                {": "}
                {a.actionable ? deadlinePhrase(a.deadline!, now) : "closed"}
              </span>
              <span lang="lv" className="text-xs text-muted-foreground">
                {a.sourceLabel}
              </span>
            </div>
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto shrink-0 self-center text-xs underline underline-offset-2"
            >
              Open
            </a>
          </li>
        );
      })}
    </ul>
  );
}
