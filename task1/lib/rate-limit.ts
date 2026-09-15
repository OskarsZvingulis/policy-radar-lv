/**
 * Outbound-scrape protection for the public endpoints.
 *
 * One digest run is a lot of traffic aimed at somebody else's servers: the
 * Saeima collector alone walks 7 day listings plus up to 15 meeting detail
 * pages each, and TAP adds 4 listing pages plus per-meeting detail fetches —
 * on the order of 100 requests to gov.lv per run, from one IP, under a
 * User-Agent that names this project. `/api/digest/stream` and
 * `/api/digest?refresh=1` were unauthenticated and unthrottled, so anyone
 * looping either URL turned the deployment into an amplifier pointed at
 * Latvian government infrastructure.
 *
 * The limit is deliberately global rather than per-IP: the thing being
 * protected is the *upstream* servers, and they experience the total, not
 * the per-caller share. A caller who arrives during the cooldown is served
 * the cached digest when one exists (which is the honest answer — the data
 * genuinely hasn't changed) and a 429 with Retry-After when it doesn't.
 *
 * Caveat, stated plainly: this is module-level state in a serverless
 * function, so it bounds a single warm instance, not the whole fleet. It
 * turns "unbounded" into "bounded per instance", which is a real reduction
 * but not a hard global guarantee. A durable store (Vercel KV / Upstash)
 * keyed on a shared lock is the correct fix if this ever runs for real, and
 * is deliberately out of scope for a prototype with no database.
 */

/** Minimum wall-clock gap between two live scrapes of the upstream sources. */
export const LIVE_RUN_COOLDOWN_MS = 5 * 60 * 1000;

let lastRunStartedAt = 0;

export interface CooldownState {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Checks the cooldown without consuming it. */
export function checkCooldown(now = Date.now()): CooldownState {
  const elapsed = now - lastRunStartedAt;
  if (lastRunStartedAt === 0 || elapsed >= LIVE_RUN_COOLDOWN_MS) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  return {
    allowed: false,
    retryAfterSeconds: Math.ceil((LIVE_RUN_COOLDOWN_MS - elapsed) / 1000),
  };
}

/**
 * Claims the right to start a live run. Returns false if the cooldown is
 * still active. Claiming marks the start immediately rather than on
 * completion, so concurrent requests can't both slip through while the
 * first run is still in flight.
 */
export function claimLiveRun(now = Date.now()): CooldownState {
  const state = checkCooldown(now);
  if (state.allowed) lastRunStartedAt = now;
  return state;
}

/**
 * Gives the cooldown back after a run that produced nothing.
 *
 * The cooldown exists to stop repeated *successful* scrapes of gov.lv. A run
 * that threw did not produce a digest, so holding the window shut for five
 * more minutes just leaves the app with no data and no way to retry, which is
 * the opposite of what the limit is for.
 */
export function releaseLiveRun(): void {
  lastRunStartedAt = 0;
}

/** Test seam. Not used in request handling. */
export function resetCooldownForTests(): void {
  lastRunStartedAt = 0;
}
