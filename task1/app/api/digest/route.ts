import { NextResponse } from "next/server";
import { getOrStartRun } from "@/lib/digest/cache";

export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("refresh") === "1";

  const outcome = getOrStartRun({ force });

  if (outcome.status === "cached") {
    return NextResponse.json(
      { ...outcome.result, fromCache: true, ageMs: outcome.ageMs },
      { headers: { "X-Digest-Cache": "hit" } },
    );
  }

  if (outcome.status === "cooldown") {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: `A live scan ran recently. Retry in ${outcome.cooldown.retryAfterSeconds}s.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(outcome.cooldown.retryAfterSeconds) },
      },
    );
  }

  // Either we started the run or joined one already going. Both await the
  // same promise, so a concurrent caller never triggers a second scrape.
  const result = await outcome.run.promise;
  return NextResponse.json(result, {
    headers: { "X-Digest-Cache": outcome.status === "joined" ? "joined" : "miss" },
  });
}
