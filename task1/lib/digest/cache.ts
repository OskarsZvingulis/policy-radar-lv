/**
 * Deliberately simple module-level cache, not a database. There's no
 * persistent state to model here — every source carries its own dates, so
 * "this week's digest" is a computation over a rolling window, not stored
 * rows. Fluid Compute reuses warm instances, so this holds up fine across a
 * demo/recording session; it's just not durable across cold starts, which is
 * an acceptable tradeoff for a prototype whose whole point is "press refresh
 * and watch it run live" rather than serving stale data fast.
 */
import type { DigestResult } from "../types";
import { isoWeekKey } from "./week";

let cached: { key: string; result: DigestResult } | null = null;

export function getCached(): DigestResult | null {
  const key = isoWeekKey();
  if (cached && cached.key === key) return cached.result;
  return null;
}

export function setCached(result: DigestResult): void {
  cached = { key: isoWeekKey(), result };
}
