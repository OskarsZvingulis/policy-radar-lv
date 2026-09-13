import { Badge } from "@/components/ui/badge";
import type { SourceResult } from "@/lib/types";

export type LiveStatus = SourceResult["status"] | "pending";

export interface LiveSourceState {
  source: string;
  label: string;
  status: LiveStatus;
  count?: number;
  durationMs?: number;
  error?: string;
}

const DOT: Record<LiveStatus, string> = {
  pending: "bg-muted-foreground/40 animate-pulse",
  ok: "bg-emerald-500",
  error: "bg-red-500",
  timeout: "bg-amber-500",
};

export function SourceStatusRow({ sources }: { sources: LiveSourceState[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {sources.map((s) => (
        <Badge
          key={s.source}
          variant="outline"
          title={s.error}
          className="gap-1.5 font-normal"
        >
          <span className={`size-1.5 rounded-full ${DOT[s.status]}`} />
          {s.label}
          {s.status === "ok" && (
            <span className="tabular-nums text-muted-foreground">{s.count}</span>
          )}
          {s.status === "timeout" && <span className="text-amber-600">timed out</span>}
          {s.status === "error" && <span className="text-red-600">error</span>}
        </Badge>
      ))}
    </div>
  );
}
