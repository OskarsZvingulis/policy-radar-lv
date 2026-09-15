import { describe, it, expect } from "vitest";
import { renderDigestMarkdown } from "../lib/digest/markdown";
import type { DigestResult, ScoredItem, SourceResult } from "../lib/types";

function scoredItem(overrides: Partial<ScoredItem>): ScoredItem {
  return {
    id: "fixture:1",
    source: "tap_legal_acts",
    sourceLabel: "TAP portāls: Tiesību aktu projekti",
    title: "Grozījumi Komerclikumā",
    url: "https://tapportals.mk.gov.lv/legal_acts/fixture",
    date: "2026-09-10T00:00:00Z",
    score: 60,
    matchedRules: ["Company/commercial law"],
    actionable: false,
    llmScored: false,
    ...overrides,
  };
}

function sourceResult(overrides: Partial<SourceResult>): SourceResult {
  return {
    source: "tap_legal_acts",
    label: "TAP portāls: Tiesību aktu projekti",
    status: "ok",
    count: 1,
    durationMs: 500,
    items: [],
    ...overrides,
  };
}

const BASE: DigestResult = {
  runId: "fixture-run-id",
  generatedAt: "2026-09-15T09:00:00Z",
  weekStart: "2026-09-07T00:00:00Z",
  weekEnd: "2026-09-13T23:59:59Z",
  sources: [sourceResult({})],
  scored: [],
  totalScanned: 10,
  totalSurfaced: 0,
  llmAvailable: false,
};

describe("renderDigestMarkdown — golden structure", () => {
  it("never renders a blank digest at zero relevant items", () => {
    const md = renderDigestMarkdown({ ...BASE, scored: [], totalSurfaced: 0 });
    expect(md).toContain("Scanned **10** items across 1 sources → surfaced **0**");
    expect(md).toContain("rules-only mode");
    // No item section at all when there's nothing to show, but the counts
    // line above must still be present — never an empty file.
    expect(md).not.toContain("## Read this first");
    expect(md.trim().length).toBeGreaterThan(0);
  });

  it("admits only items with an open window to the closing-soonest block, soonest first", () => {
    const closesLater = scoredItem({
      id: "a",
      title: "Konsultācija ar vēlāku termiņu",
      score: 40,
      actionable: true,
      deadline: "2026-09-25T00:00:00Z",
    });
    const closesSooner = scoredItem({
      id: "c",
      title: "Konsultācija ar tuvāku termiņu",
      score: 20,
      actionable: true,
      deadline: "2026-09-18T00:00:00Z",
    });
    // Scores higher than either, but nothing to submit into — a reader who
    // treats this block as a to-do list must not find it here.
    const noDeadline = scoredItem({ id: "b", title: "Augstāks skalojums", score: 90 });

    const md = renderDigestMarkdown({
      ...BASE,
      scored: [noDeadline, closesLater, closesSooner],
      totalSurfaced: 3,
    });
    const block = md.split("## Closing soonest")[1].split("## All startup-relevant items")[0];

    expect(block).not.toContain("Augstāks skalojums");
    expect(block.indexOf("tuvāku termiņu")).toBeLessThan(block.indexOf("vēlāku termiņu"));
  });

  it("includes run id, model, and a cost figure in the footer", () => {
    const md = renderDigestMarkdown({
      ...BASE,
      llmAvailable: true,
      llmUsage: {
        model: "anthropic/claude-sonnet-5",
        promptVersion: "2026-09-15.1",
        itemsSent: 3,
        inputTokens: 1200,
        outputTokens: 300,
        estimatedCostUsd: 0.0054,
      },
    });
    expect(md).toContain("fixture-run-id");
    expect(md).toContain("anthropic/claude-sonnet-5");
    expect(md).toContain("$0.0054");
  });

  it("reports $0.00 cost in the footer when running rules-only", () => {
    const md = renderDigestMarkdown(BASE);
    expect(md).toContain("$0.00 (rules-only)");
  });

  it("lists every scanned source with its status in the sources table", () => {
    const md = renderDigestMarkdown({
      ...BASE,
      sources: [sourceResult({ source: "saeima_committees", label: "Saeima", status: "error", error: "boom" })],
    });
    expect(md).toContain("| Saeima | error | 1 |");
  });
});
