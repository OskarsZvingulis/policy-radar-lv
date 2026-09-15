/**
 * Weekly warm-up: runs the digest once so a visit early in the week has a
 * populated cache instead of triggering a cold run. Scheduled via
 * vercel.json.
 *
 * Caveat worth stating, since the route used to claim more than it delivers:
 * the cache is module-level state in a serverless function (see cache.ts), so
 * this warms whichever instance the cron invocation happens to land on. A
 * later visitor may well hit a different, cold instance. It's a best-effort
 * warm, not a guarantee, and a durable cache is the real fix.
 */
import { NextResponse } from "next/server";
import { runDigest } from "@/lib/digest/run";
import { setCached } from "@/lib/digest/cache";

export const maxDuration = 60;

export async function GET(request: Request) {
  // Fails CLOSED. The previous form — `if (process.env.CRON_SECRET && ...)` —
  // meant that forgetting to set the secret silently disabled authentication
  // entirely, leaving a public endpoint that fires ~100 requests at gov.lv on
  // demand. An unset secret is a misconfiguration, not permission to run.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "not_configured", message: "CRON_SECRET is not set; refusing to run." },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runDigest();
  setCached(result);
  return NextResponse.json({
    ok: true,
    totalScanned: result.totalScanned,
    totalSurfaced: result.totalSurfaced,
  });
}
