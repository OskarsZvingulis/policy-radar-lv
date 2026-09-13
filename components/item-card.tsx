import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TierBadge } from "@/components/tier-badge";
import type { ScoredItem } from "@/lib/types";

function deadlineLabel(deadlineIso: string): { text: string; urgent: boolean } {
  const ms = new Date(deadlineIso).getTime() - Date.now();
  const days = Math.ceil(ms / 86_400_000);
  if (days < 0) return { text: "closed", urgent: false };
  if (days === 0) return { text: "closes today", urgent: true };
  if (days === 1) return { text: "closes tomorrow", urgent: true };
  return { text: `closes in ${days} days`, urgent: days <= 5 };
}

export function ItemCard({ item }: { item: ScoredItem }) {
  const deadline = item.deadline ? deadlineLabel(item.deadline) : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-balance">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {item.title}
            </a>
          </CardTitle>
          <TierBadge tier={item.tier} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-muted-foreground">
          <Badge variant="secondary">{item.sourceLabel}</Badge>
          {item.institution && <Badge variant="outline">{item.institution}</Badge>}
          {item.stage && <Badge variant="outline">{item.stage}</Badge>}
          {deadline && (
            <Badge
              variant="outline"
              className={deadline.urgent ? "border-red-500/40 text-red-600 dark:text-red-400" : ""}
            >
              ⏰ {deadline.text}
            </Badge>
          )}
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
