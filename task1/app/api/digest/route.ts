import { NextResponse } from "next/server";
import { runDigest } from "@/lib/digest/run";
import { getCached, setCached } from "@/lib/digest/cache";
import { claimLiveRun } from "@/lib/rate-limit";

export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "1";

  if (!refresh) {
    const cached = getCached();
    if (cached) return NextResponse.json(cached);
  }

  // A live run means ~100 outbound requests to gov.lv. Serve cache during the
  // cooldown; only 429 when there's genuinely nothing to return.
  const claim = claimLiveRun();
  if (!claim.allowed) {
    const cached = getCached();
    if (cached) {
      return NextResponse.json(cached, {
        headers: { "X-Digest-Cache": "cooldown", "Retry-After": String(claim.retryAfterSeconds) },
      });
    }
    return NextResponse.json(
      {
        error: "rate_limited",
        message: `A live scan ran recently. Retry in ${claim.retryAfterSeconds}s.`,
      },
      { status: 429, headers: { "Retry-After": String(claim.retryAfterSeconds) } },
    );
  }

  const result = await runDigest();
  setCached(result);
  return NextResponse.json(result);
}
