import { cn } from "cn";
import { urgencyOf, rowDateLabel, type Urgency } from "@/lib/digest/urgency";

const TONE: Record<Urgency, string> = {
  today: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  week: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  later: "text-foreground",
  none: "text-muted-foreground",
};

/**
 * The row's date column, and the only place a date gets a colour. `tinted`
 * says whether this date is a genuine open submission window; when it isn't
 * (a meeting date, a published-article date, a closed deadline) the label
 * still renders but never in red or amber. Colour on a date the reader
 * cannot act on would just be noise competing with the dates that matter.
 */
export function DeadlineBadge({
  iso,
  tinted,
  now = new Date(),
  className,
}: {
  iso?: string;
  tinted: boolean;
  now?: Date;
  className?: string;
}) {
  const urgency = tinted ? urgencyOf(iso, now) : "later";
  return (
    <div
      className={cn(
        "flex h-fit w-16 shrink-0 flex-col items-start rounded-md px-1.5 py-1 text-xs font-medium tabular-nums sm:w-[4.5rem]",
        TONE[urgency],
        className,
      )}
    >
      {iso ? rowDateLabel(iso, now) : "·"}
    </div>
  );
}
