import { Badge } from "@/components/ui/badge";
import type { Tier } from "@/lib/types";

const TIER_CONFIG: Record<Tier, { label: string; className: string }> = {
  act_now: {
    label: "🔴 Act now",
    className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  },
  watch: {
    label: "🟡 Watch",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  },
  fyi: {
    label: "⚪ FYI",
    className: "bg-muted text-muted-foreground border-border",
  },
  excluded: {
    label: "Excluded",
    className: "bg-muted text-muted-foreground border-border",
  },
};

export function TierBadge({ tier }: { tier: Tier }) {
  const cfg = TIER_CONFIG[tier];
  return (
    <Badge variant="outline" className={cfg.className}>
      {cfg.label}
    </Badge>
  );
}
