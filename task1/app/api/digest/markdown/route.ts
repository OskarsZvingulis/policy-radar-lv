/**
 * Markdown export. Goes through the same single-flight run as everything
 * else: it used to call runDigest() directly on a cold cache, which made it a
 * third unguarded way for anyone to start ~100 outbound requests to gov.lv.
 */
import { getOrStartRun } from "@/lib/digest/cache";
import { renderDigestMarkdown } from "@/lib/digest/markdown";

export const maxDuration = 60;

export async function GET() {
  const outcome = getOrStartRun();

  if (outcome.status === "cooldown") {
    return new Response(
      `A live scan ran recently and no digest is cached yet. Retry in ${outcome.cooldown.retryAfterSeconds}s.`,
      {
        status: 429,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Retry-After": String(outcome.cooldown.retryAfterSeconds),
        },
      },
    );
  }

  const result = outcome.status === "cached" ? outcome.result : await outcome.run.promise;

  return new Response(renderDigestMarkdown(result), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'inline; filename="policy-radar-digest.md"',
    },
  });
}
