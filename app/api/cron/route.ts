/**
 * Weekly warm-up: runs the digest once so the first human visit of the week
 * hits a populated cache instead of triggering a cold ~30-60s run. Scheduled
 * via vercel.ts.
 */
import { NextResponse } from "next/server";
import { runDigest } from "@/lib/digest/run";
import { setCached } from "@/lib/digest/cache";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runDigest();
  setCached(result);
  return NextResponse.json({ ok: true, totalScanned: result.totalScanned, totalSurfaced: result.totalSurfaced });
}
