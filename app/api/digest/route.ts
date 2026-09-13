import { NextResponse } from "next/server";
import { runDigest } from "@/lib/digest/run";
import { getCached, setCached } from "@/lib/digest/cache";

export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const refresh = searchParams.get("refresh") === "1";

  if (!refresh) {
    const cached = getCached();
    if (cached) return NextResponse.json(cached);
  }

  const result = await runDigest();
  setCached(result);
  return NextResponse.json(result);
}
