import { describe, it, expect, afterEach } from "vitest";
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

describe("retry budget fits inside the per-source timeout", () => {
  it("cannot start an attempt the source budget could never let finish", () => {
    // The original defect: one fetchText could run ~31s against a 20s source
    // timeout, so the final retry was structurally unable to complete.
    expect(MAX_FETCH_BUDGET_MS).toBeLessThan(PER_SOURCE_TIMEOUT_MS);
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
