function minutesAgo(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "moments ago";
  return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
}

/** Same age, compressed for the phone-width cache notice. */
function minutesAgoShort(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  return minutes < 1 ? "just now" : `${minutes} min ago`;
}

/** Tells a reader whether they're looking at a fresh scan or a cached one, in
 * one line that shortens on phones rather than wrapping. */
export function CacheNotice({ ageMs }: { ageMs: number }) {
  return (
    <p className="px-3 pt-2 text-xs text-muted-foreground">
      <span className="sm:hidden">Updated {minutesAgoShort(ageMs)}</span>
      <span className="hidden sm:inline">
        Showing results from {minutesAgo(ageMs)}. The sources are only re-scanned every few minutes.
      </span>
    </p>
  );
}
