import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder rows shown while the first scan is still running. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading digest">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0">
          <Skeleton className="h-8 w-16 shrink-0 sm:w-[4.5rem]" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
