import { describe, it, expect } from "vitest";
import { groupDigest, groupForList, closingSoonest, hasOpenWindow } from "../lib/digest/group";
import type { ScoredItem } from "../lib/types";

/**
 * D2: the UI, the Markdown export and the HTML export each carried their own
 * copy of this, annotated "kept in sync by hand". They had already drifted
 * once. These tests cover the one shared implementation they now all call.
 */

const NOW = new Date("2026-09-15T10:00:00Z");

const item = (over: Partial<ScoredItem> & { id: string }): ScoredItem =>
  ({
    source: "tap_legal_acts",
    sourceLabel: "TAP portāls: Tiesību aktu projekti",
    title: over.id,
    url: `https://example.lv/${over.id}`,
    date: "2026-09-12T00:00:00.000Z",
    score: 50,
    matchedRules: [],
    actionable: false,
    llmScored: false,
    ...over,
  }) as ScoredItem;

describe("hasOpenWindow", () => {
  it("is false for a deadline that has passed, even if scored actionable", () => {
    const stale = item({ id: "a", actionable: true, deadline: "2026-09-01T00:00:00.000Z" });
    expect(hasOpenWindow(stale, NOW)).toBe(false);
  });

  it("is true on the closing day itself", () => {
    const today = item({ id: "b", actionable: true, deadline: "2026-09-15T00:00:00.000Z" });
    expect(hasOpenWindow(today, NOW)).toBe(true);
  });

  it("is false with no deadline at all", () => {
    expect(hasOpenWindow(item({ id: "c", actionable: true }), NOW)).toBe(false);
  });
});

describe("groupDigest", () => {
  it("splits on whether there is an open window, soonest first", () => {
    const { open, awareness } = groupDigest(
      [
        item({ id: "later", actionable: true, deadline: "2026-09-20T00:00:00.000Z" }),
        item({ id: "none", score: 99 }),
        item({ id: "sooner", actionable: true, deadline: "2026-09-16T00:00:00.000Z" }),
      ],
      { now: NOW },
    );
    expect(open.map((i) => i.id)).toEqual(["sooner", "later"]);
    expect(awareness.map((i) => i.id)).toEqual(["none"]);
  });

  it("sorts placeholder dates last rather than as if they were today", () => {
    const { awareness } = groupDigest(
      [
        item({ id: "placeholder", date: NOW.toISOString(), dateIsApproximate: true }),
        item({ id: "real", date: "2026-09-14T00:00:00.000Z" }),
      ],
      { now: NOW },
    );
    expect(awareness.map((i) => i.id)).toEqual(["real", "placeholder"]);
  });

  it("sorts by score in relevance mode", () => {
    const { awareness } = groupDigest(
      [item({ id: "low", score: 10 }), item({ id: "high", score: 90 })],
      { now: NOW, sortBy: "relevance" },
    );
    expect(awareness.map((i) => i.id)).toEqual(["high", "low"]);
  });

  it("puts an expired deadline in the awareness half, not the actionable one", () => {
    const { open, awareness } = groupDigest(
      [item({ id: "expired", actionable: true, deadline: "2026-09-01T00:00:00.000Z" })],
      { now: NOW },
    );
    expect(open).toHaveLength(0);
    expect(awareness.map((i) => i.id)).toEqual(["expired"]);
  });
});

describe("groupForList", () => {
  it("splits the open half into this-week and later at the 7-day boundary", () => {
    const { closingThisWeek, closingLater, noWindow } = groupForList(
      [
        item({ id: "in3", actionable: true, deadline: "2026-09-18T00:00:00.000Z" }), // 3 days
        item({ id: "in7", actionable: true, deadline: "2026-09-22T00:00:00.000Z" }), // 7 days
        item({ id: "in8", actionable: true, deadline: "2026-09-23T00:00:00.000Z" }), // 8 days
        item({ id: "no-window" }),
      ],
      { now: NOW },
    );
    expect(closingThisWeek.map((i) => i.id)).toEqual(["in3", "in7"]);
    expect(closingLater.map((i) => i.id)).toEqual(["in8"]);
    expect(noWindow.map((i) => i.id)).toEqual(["no-window"]);
  });

  it("produces an empty closingLater and noWindow when everything is closing this week", () => {
    const { closingThisWeek, closingLater, noWindow } = groupForList(
      [item({ id: "a", actionable: true, deadline: "2026-09-16T00:00:00.000Z" })],
      { now: NOW },
    );
    expect(closingThisWeek).toHaveLength(1);
    expect(closingLater).toHaveLength(0);
    expect(noWindow).toHaveLength(0);
  });
});

describe("closingSoonest", () => {
  it("admits only items with an open window", () => {
    const out = closingSoonest(
      [
        item({ id: "high-no-deadline", score: 100 }),
        item({ id: "open", actionable: true, deadline: "2026-09-16T00:00:00.000Z" }),
      ],
      { now: NOW },
    );
    expect(out.map((i) => i.id)).toEqual(["open"]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 8 }, (_, n) =>
      item({
        id: `d${n}`,
        actionable: true,
        deadline: new Date(Date.UTC(2026, 8, 16 + n)).toISOString(),
      }),
    );
    expect(closingSoonest(many, { now: NOW })).toHaveLength(5);
  });
});
