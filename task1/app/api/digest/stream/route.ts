/**
 * SSE stream of the live digest run: one event per source as it completes,
 * then a final `done` event with the full DigestResult. This is what a
 * screen recording actually shows — the JSON /api/digest route alone would
 * just show a page appearing, which doesn't prove anything is running live.
 */
import { runDigest } from "@/lib/digest/run";
import { getCached, setCached } from "@/lib/digest/cache";
import { claimLiveRun } from "@/lib/rate-limit";

export const maxDuration = 60;

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET() {
  const encoder = new TextEncoder();

  // Same outbound-scrape guard as /api/digest — this endpoint is public and
  // each call is ~100 requests to gov.lv. During the cooldown the stream
  // still completes normally from cache so the UI never hangs waiting.
  const claim = claimLiveRun();
  if (!claim.allowed) {
    const cached = getCached();
    const body =
      sseEvent("start", { at: new Date().toISOString(), fromCache: true }) +
      (cached
        ? (cached.sources ?? []).map((s) => sseEvent("source", s)).join("") + sseEvent("done", cached)
        : sseEvent("error", {
            message: `A live scan ran recently. Retry in ${claim.retryAfterSeconds}s.`,
            retryAfterSeconds: claim.retryAfterSeconds,
          }));
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Retry-After": String(claim.retryAfterSeconds),
      },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // client disconnected; nothing to do
        }
      };

      enqueue(sseEvent("start", { at: new Date().toISOString() }));

      try {
        const result = await runDigest((source) => {
          enqueue(sseEvent("source", source));
        });
        setCached(result);
        enqueue(sseEvent("done", result));
      } catch (err) {
        enqueue(sseEvent("error", { message: err instanceof Error ? err.message : String(err) }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
