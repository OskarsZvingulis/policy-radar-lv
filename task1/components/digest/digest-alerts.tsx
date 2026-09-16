import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { DigestResult } from "@/lib/types";

/** The two ways a digest can be visibly incomplete: the live run itself
 * failed (runError), or it finished but one or more sources came back empty
 * or unhealthy (degraded). Both are silent otherwise, so a reader would have
 * no way to tell "no items" from "we couldn't reach the source". */
export function DigestAlerts({
  runError,
  onRetry,
  digest,
}: {
  runError: string | null;
  onRetry: () => void;
  digest: DigestResult | null;
}) {
  const degraded = (digest?.sources ?? []).filter((s) => s.status !== "ok" || s.count === 0);

  return (
    <>
      {runError && (
        <Alert variant="destructive" className="m-3 rounded-md">
          <AlertTitle>Scan did not complete</AlertTitle>
          <AlertDescription>
            {runError}{" "}
            <button onClick={onRetry} className="underline underline-offset-4">
              Try again
            </button>
          </AlertDescription>
        </Alert>
      )}

      {digest && degraded.length > 0 && (
        <Alert variant="destructive" className="m-3 rounded-md">
          <AlertTitle>
            This digest is incomplete: {degraded.length} of {digest.sources.length} sources did not deliver
          </AlertTitle>
          <AlertDescription>
            Items from {degraded.map((s) => s.label).join(", ")} are missing below.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
