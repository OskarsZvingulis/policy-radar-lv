import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ScoredItem } from "@/lib/types";
import { describeItemDates } from "@/lib/dates";

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function relativeDay(iso: string, isDeadline: boolean): string | null {
  if (!isDeadline) return null;
  const days = daysUntil(iso);
  if (days < 0) return "closed";
  if (days === 0) return "closes today";
  if (days === 1) return "closes tomorrow";
  return `closes in ${days} days`;
}

export function ItemCard({ item }: { item: ScoredItem }) {
  const dates = describeItemDates(item);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-balance">
          <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {item.title}
          </a>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted-foreground">
          <Badge variant="secondary">{item.sourceLabel}</Badge>
          {item.institution && <Badge variant="outline">{item.institution}</Badge>}
          {item.stage && <Badge variant="outline">{item.stage}</Badge>}
          {dates.map((d) => {
            const rel = relativeDay(d.iso, d.isDeadline);
            const days = daysUntil(d.iso);
            const urgent = d.isDeadline && days <= 5 && days >= 0;
            return (
              <Badge
                key={d.label}
                variant="outline"
                className={urgent ? "border-red-500/40 text-red-600 dark:text-red-400" : ""}
                title={d.label}
              >
                {d.isDeadline ? "⏰ " : ""}
                {d.label}: {new Date(d.iso).toISOString().slice(0, 10)}
                {rel ? ` (${rel})` : ""}
              </Badge>
            );
          })}
          <span className="ml-auto tabular-nums opacity-60">relevance {item.score}</span>
        </div>
      </CardHeader>
      <CardContent>
        {item.whyItMatters ? (
          <p className="text-sm">{item.whyItMatters}</p>
        ) : item.matchedRules.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Matched: {item.matchedRules.join(", ")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
