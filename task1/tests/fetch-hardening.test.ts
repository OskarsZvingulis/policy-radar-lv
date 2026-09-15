import { describe, it, expect, afterEach, vi } from "vitest";
import {
  looksLikeWafRejection,
  SourceFetchError,
  SourceTimeoutError,
  MAX_FETCH_BUDGET_MS,
  fetchText,
} from "../lib/sources/fetch-utils";
import { PER_SOURCE_TIMEOUT_MS } from "../lib/digest/run";
import { checkCooldown, claimLiveRun, resetCooldownForTests, LIVE_RUN_COOLDOWN_MS } from "../lib/rate-limit";

describe("WAF rejection detection", () => {
  const body = '<html><head><title>Request Rejected</title></head><body>The requested URL was rejected.</body></html>';

  it("detects the plain rejection page", () => {
    expect(looksLikeWafRejection(body)).toBe(true);
  });

  it("still detects it behind a BOM", () => {
    expect(looksLikeWafRejection("﻿" + body)).toBe(true);
  });

  it("still detects it behind leading whitespace and newlines", () => {
    expect(looksLikeWafRejection("\n\n   " + body)).toBe(true);
  });

  it("still detects it when the case differs", () => {
    expect(looksLikeWafRejection(body.toUpperCase())).toBe(true);
  });

  it("does not fire on ordinary markup", () => {
    expect(looksLikeWafRejection("<html><body><table>real data</table></body></html>")).toBe(false);
  });
});

describe("SourceFetchError carries a structured status", () => {
  it("stores the numeric status rather than only embedding it in the message", () => {
    const err = new SourceFetchError("HTTP 503 from x", "x", undefined, 503);
    expect(err.status).toBe(503);
  });

  it("leaves status undefined for transport failures", () => {
    expect(new SourceFetchError("Fetch failed", "x").status).toBeUndefined();
    expect(new SourceTimeoutError("x").status).toBeUndefined();
  });
});

describe("retry budget", () => {
  /**
   * This assertion used to stand alone as proof that a source could not
   * outrun its timeout. It does not prove that: MAX_FETCH_BUDGET_MS bounds a
   * single fetchText, while a collector makes many (tap.ts walks 4 listing
   * pages, saeima.ts walks 7 days with up to 15 detail pages each), so one
   * source could exceed the 20s deadline by design and the test still passed.
   *
   * It is kept only as a bound on one request. What actually stops a slow
   * source is the abort wiring, covered below.
   */
  it("bounds a single request well inside the source deadline", () => {
    expect(MAX_FETCH_BUDGET_MS).toBeLessThan(PER_SOURCE_TIMEOUT_MS);
  });
});

describe("a collector stops fetching once its deadline fires", () => {
  afterEach(() => vi.unstubAllGlobals());

  // Real TAP row markup. If this stopped parsing, the collector would throw
  // on page 1 and the call count would be 1 for the wrong reason, so the test
  // also asserts that items came back.
  const page =
    '<div class="grid grid--wrap grid--row flextable__row" data-url="/legal_acts/abc">' +
    '<div data-column-header-name="Projekta ID"><span class="flextable__value">26-TA-1</span> </div>' +
    '<div data-column-header-name="Tiesību akta nosaukums"><span class="flextable__value">Grozījumi Komerclikumā</span> </div>' +
    "</div>";

  it("parses the fixture, so the call count below means what it says", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(page, { status: 200 })));
    const { collectTapLegalActs } = await import("../lib/sources/tap");
    const items = await collectTapLegalActs();
    expect(items.length).toBeGreaterThan(0);
  });

  it("makes no further requests after the signal aborts", async () => {
    const calls: string[] = [];
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        controller.abort(); // the deadline fires while page 1 is in flight
        return new Response(page, { status: 200 });
      }),
    );

    const { collectTapLegalActs } = await import("../lib/sources/tap");
    const items = await collectTapLegalActs(controller.signal);

    // Page 1 was fetched and parsed; pages 2 to 4 were never requested.
    expect(items.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
  });
});

describe("fetchText honours an external abort", () => {
  it("stops immediately instead of retrying when the caller has given up", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(fetchText("https://example.invalid/x", { signal: controller.signal })).rejects.toBeInstanceOf(
      SourceFetchError,
    );
  });
});

describe("live-run cooldown", () => {
  afterEach(() => resetCooldownForTests());

  it("allows the first run", () => {
    expect(claimLiveRun().allowed).toBe(true);
  });

  it("blocks a second run inside the cooldown and reports when to retry", () => {
    const t0 = 1_000_000;
    expect(claimLiveRun(t0).allowed).toBe(true);
    const second = claimLiveRun(t0 + 1000);
    expect(second.allowed).toBe(false);
    expect(second.retryAfterSeconds).toBeGreaterThan(0);
    expect(second.retryAfterSeconds).toBeLessThanOrEqual(LIVE_RUN_COOLDOWN_MS / 1000);
  });

  it("allows another run once the cooldown has elapsed", () => {
    const t0 = 1_000_000;
    claimLiveRun(t0);
    expect(claimLiveRun(t0 + LIVE_RUN_COOLDOWN_MS).allowed).toBe(true);
  });

  it("checkCooldown does not consume the allowance", () => {
    const t0 = 1_000_000;
    expect(checkCooldown(t0).allowed).toBe(true);
    expect(checkCooldown(t0).allowed).toBe(true);
    expect(claimLiveRun(t0).allowed).toBe(true);
  });
});
