/**
 * The one place a digest run is started, and the one place a finished run is
 * kept.
 *
 * Deliberately a module-level cache, not a database. There is no persistent
 * state to model here: every source carries its own dates, so "this week's
 * digest" is a computation over a rolling window, not stored rows. Fluid
 * Compute reuses warm instances, so this holds up across a demo session; it
 * is not durable across cold starts, which is an acceptable tradeoff for a
 * prototype whose point is "press refresh and watch it run live".
 *
 * Single-flight is the part that matters. The cooldown used to be claimed
 * when a run *started* while the cache was only filled when it *ended*, 10 to
 * 30 seconds later. Anyone arriving in that window was refused, had no cache
 * to fall back on, and was shown "the scan stopped before it finished" while
 * the scan was in fact still running. On Vercel that is the normal first load
 * after a deploy or a cold start, so a second browser tab, or one refresh,
 * was enough to produce it.
 *
 * Now a late caller joins the run already in progress and is replayed the
 * sources that have already settled, so it sees the same live progress as the
 * caller who started it. The cooldown only ever guards *starting a new run*
 * when a finished one is recent enough to serve instead.
 */
import type { DigestResult, SourceResult } from "../types";
import { runDigest } from "./run";
import { isoWeekKey } from "./week";
import { claimLiveRun, checkCooldown, releaseLiveRun, type CooldownState } from "../rate-limit";

let cached: { key: string; result: DigestResult; at: number } | null = null;

interface InFlight {
  promise: Promise<DigestResult>;
  /** Sources that have already settled, replayed to late subscribers. */
  settled: SourceResult[];
  listeners: Set<(s: SourceResult) => void>;
}

let inFlight: InFlight | null = null;

export function getCached(): DigestResult | null {
  const key = isoWeekKey();
  if (cached && cached.key === key) return cached.result;
  return null;
}

/** How old the cached digest is, for "showing results from N min ago". */
export function getCachedAgeMs(now = Date.now()): number | null {
  const key = isoWeekKey();
  if (cached && cached.key === key) return now - cached.at;
  return null;
}

export function setCached(result: DigestResult, now = Date.now()): void {
  cached = { key: isoWeekKey(), result, at: now };
}

export function resetRunStateForTests(): void {
  cached = null;
  inFlight = null;
}

export type RunOutcome =
  | { status: "started" | "joined"; run: RunHandle }
  | { status: "cached"; result: DigestResult; ageMs: number }
  | { status: "cooldown"; cooldown: CooldownState };

export interface RunHandle {
  promise: Promise<DigestResult>;
  /** Replays already-settled sources, then streams the rest. Returns an unsubscribe. */
  subscribe(fn: (s: SourceResult) => void): () => void;
}

function handleFor(run: InFlight): RunHandle {
  return {
    promise: run.promise,
    subscribe(fn) {
      // Replay first so a late joiner's UI fills in rather than sitting on
      // pending placeholders for sources that already finished.
      for (const s of run.settled) fn(s);
      run.listeners.add(fn);
      return () => run.listeners.delete(fn);
    },
  };
}

/**
 * Starts a run, joins the one already running, or declines with a reason.
 *
 * `force` is the Refresh button: it still joins an in-flight run (there is no
 * point starting a second scrape of the same servers) but it will not accept
 * a cached result.
 */
export function getOrStartRun({ force = false }: { force?: boolean } = {}): RunOutcome {
  if (inFlight) return { status: "joined", run: handleFor(inFlight) };

  if (!force) {
    const result = getCached();
    if (result) return { status: "cached", result, ageMs: getCachedAgeMs() ?? 0 };
  }

  // Nothing running and nothing servable: this is the only path that reaches
  // out to gov.lv, so it is the only one the cooldown needs to guard.
  const cooldown = checkCooldown();
  if (!cooldown.allowed) {
    const result = getCached();
    if (result) return { status: "cached", result, ageMs: getCachedAgeMs() ?? 0 };
    return { status: "cooldown", cooldown };
  }
  claimLiveRun();

  const settled: SourceResult[] = [];
  const listeners = new Set<(s: SourceResult) => void>();
  // Cleared by identity, so a run that settles unusually fast can never clear
  // a newer run that has already taken its place.
  let self: InFlight | null = null;

  const promise = runDigest((source) => {
    settled.push(source);
    for (const fn of listeners) {
      try {
        fn(source);
      } catch {
        // one disconnected subscriber must not derail the run
      }
    }
  })
    .then((result) => {
      setCached(result);
      return result;
    })
    .catch((err) => {
      releaseLiveRun();
      throw err;
    })
    .finally(() => {
      if (inFlight === self) inFlight = null;
    });

  const run: InFlight = { promise, settled, listeners };
  self = run;
  inFlight = run;
  return { status: "started", run: handleFor(run) };
}
