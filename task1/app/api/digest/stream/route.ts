/**
 * SSE stream of the live digest run: one event per source as it settles, then
 * a final `done` event carrying the full DigestResult. This is what a screen
 * recording actually shows. The JSON route alone would just show a page
 * appearing, which proves nothing about the data being live.
 *
 * The failure event is called `failed`, not `error`. `EventSource` fires its
 * own `error` event for transport problems, so a server-sent `error` landed
 * on the same listener and the UI could not tell "a source blew up, here is
 * why" from "the connection dropped", and threw the server's message away.
 */
import { getOrStartRun } from "@/lib/digest/cache";

export const maxDuration = 60;

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  const force = new URL(request.url).searchParams.get("refresh") === "1";
  const outcome = getOrStartRun({ force });

  // Nothing to run and nothing to serve: say when it can be retried rather
  // than leaving the page claiming it is still scanning.
  if (outcome.status === "cooldown") {
    const body =
      sseEvent("start", { at: new Date().toISOString(), fromCache: false }) +
      sseEvent("failed", {
        message: `A live scan ran recently. Retry in ${outcome.cooldown.retryAfterSeconds}s.`,
        retryAfterSeconds: outcome.cooldown.retryAfterSeconds,
      });
    return new Response(body, {
      headers: { ...SSE_HEADERS, "Retry-After": String(outcome.cooldown.retryAfterSeconds) },
    });
  }

  if (outcome.status === "cached") {
    const body =
      sseEvent("start", { at: new Date().toISOString(), fromCache: true }) +
      (outcome.result.sources ?? []).map((s) => sseEvent("source", s)).join("") +
      sseEvent("done", { ...outcome.result, fromCache: true, ageMs: outcome.ageMs });
    return new Response(body, { headers: SSE_HEADERS });
  }

  const { run } = outcome;
  const joined = outcome.status === "joined";

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const enqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true; // client disconnected
        }
      };

      enqueue(sseEvent("start", { at: new Date().toISOString(), fromCache: false, joined }));

      // Replays whatever already settled, then streams the rest. A visitor who
      // arrives 20s into someone else's scan sees the finished sources
      // immediately instead of being told the run failed.
      const unsubscribe = run.subscribe((source) => enqueue(sseEvent("source", source)));

      try {
        const result = await run.promise;
        enqueue(sseEvent("done", result));
      } catch (err) {
        enqueue(sseEvent("failed", { message: err instanceof Error ? err.message : String(err) }));
      } finally {
        unsubscribe();
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
