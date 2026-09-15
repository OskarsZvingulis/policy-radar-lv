import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DigestResult, SourceResult } from "../lib/types";

/**
 * B2 from the second review: the cooldown started when a run *started* but the
 * cache was only filled when it *ended*, so anyone arriving in the 10 to 30
 * second gap was refused, had no cache to fall back on, and was shown "the
 * scan stopped before it finished" while it was still running. On Vercel that
 * is the ordinary first load after a deploy.
 */

const settleSource = vi.hoisted(() => ({ emit: undefined as ((s: SourceResult) => void) | undefined }));
const runState = vi.hoisted(() => ({
  calls: 0,
  resolve: undefined as ((r: DigestResult) => void) | undefined,
  reject: undefined as ((e: Error) => void) | undefined,
}));

vi.mock("../lib/digest/run", () => ({
  runDigest: vi.fn((onSource?: (s: SourceResult) => void) => {
    runState.calls++;
    settleSource.emit = onSource;
    return new Promise<DigestResult>((res, rej) => {
      runState.resolve = res;
      runState.reject = rej;
    });
  }),
}));

const { getOrStartRun, resetRunStateForTests, getCached } = await import("../lib/digest/cache");
const { resetCooldownForTests, checkCooldown } = await import("../lib/rate-limit");

const digest = (): DigestResult =>
  ({
    runId: "r1",
    generatedAt: new Date().toISOString(),
    weekStart: "2026-09-14T00:00:00.000Z",
    weekEnd: "2026-09-20T00:00:00.000Z",
    sources: [],
    scored: [],
    totalScanned: 10,
    totalSurfaced: 2,
    llmAvailable: false,
  }) as DigestResult;

const source = (id: string): SourceResult =>
  ({ source: id, label: id, status: "ok", count: 1, durationMs: 5, items: [] }) as SourceResult;

beforeEach(() => {
  runState.calls = 0;
  resetRunStateForTests();
  resetCooldownForTests();
});

afterEach(() => {
  runState.resolve?.(digest());
});

describe("single-flight digest run", () => {
  it("a second caller during a run joins it instead of being refused", async () => {
    const first = getOrStartRun();
    expect(first.status).toBe("started");

    const second = getOrStartRun();
    expect(second.status).toBe("joined");
    expect(runState.calls).toBe(1); // one scrape of gov.lv, not two
  });

  it("replays already-settled sources to a late joiner", async () => {
    const first = getOrStartRun();
    if (first.status !== "started") throw new Error("expected a started run");

    settleSource.emit?.(source("tap_legal_acts"));
    settleSource.emit?.(source("saeima_committees"));

    const seen: string[] = [];
    const second = getOrStartRun();
    if (second.status !== "joined") throw new Error("expected to join");
    second.run.subscribe((s) => seen.push(s.source));

    // The joiner gets the two that already finished, immediately.
    expect(seen).toEqual(["tap_legal_acts", "saeima_committees"]);

    settleSource.emit?.(source("liaa_news"));
    expect(seen).toEqual(["tap_legal_acts", "saeima_committees", "liaa_news"]);
  });

  it("both callers resolve with the same result", async () => {
    const first = getOrStartRun();
    const second = getOrStartRun();
    if (first.status === "cached" || first.status === "cooldown") throw new Error("bad state");
    if (second.status === "cached" || second.status === "cooldown") throw new Error("bad state");

    const result = digest();
    runState.resolve?.(result);

    expect(await first.run.promise).toBe(result);
    expect(await second.run.promise).toBe(result);
  });

  it("caches the finished run so the next caller pays nothing", async () => {
    const first = getOrStartRun();
    if (first.status !== "started") throw new Error("expected a started run");
    runState.resolve?.(digest());
    await first.run.promise;

    const next = getOrStartRun();
    expect(next.status).toBe("cached");
    expect(runState.calls).toBe(1);
  });

  it("a failed run gives the cooldown back instead of locking out for 5 minutes", async () => {
    const first = getOrStartRun();
    if (first.status !== "started") throw new Error("expected a started run");
    expect(checkCooldown().allowed).toBe(false); // claimed while running

    runState.reject?.(new Error("every source down"));
    await expect(first.run.promise).rejects.toThrow("every source down");

    expect(checkCooldown().allowed).toBe(true);
    expect(getCached()).toBeNull();

    // And the next caller can actually start a fresh run.
    expect(getOrStartRun().status).toBe("started");
  });

  it("force still joins an in-flight run rather than starting a second scrape", () => {
    getOrStartRun();
    const forced = getOrStartRun({ force: true });
    expect(forced.status).toBe("joined");
    expect(runState.calls).toBe(1);
  });

  it("force ignores a warm cache and scans again", async () => {
    const first = getOrStartRun();
    if (first.status !== "started") throw new Error("expected a started run");
    runState.resolve?.(digest());
    await first.run.promise;
    resetCooldownForTests(); // pretend the window has passed

    expect(getOrStartRun({ force: true }).status).toBe("started");
    expect(runState.calls).toBe(2);
  });
});
