import { describe, it, expect } from "vitest";
import { urgencyOf, rowDateLabel } from "../lib/digest/urgency";

const NOW = new Date("2026-09-15T10:00:00Z");

describe("urgencyOf", () => {
  it.each([
    ["2026-09-15T00:00:00.000Z", "today"],
    ["2026-09-16T00:00:00.000Z", "today"], // tomorrow counts as urgent too
    ["2026-09-20T00:00:00.000Z", "week"],
    ["2026-09-22T00:00:00.000Z", "week"],
    ["2026-10-03T00:00:00.000Z", "later"],
  ])("%s -> %s", (iso, expected) => {
    expect(urgencyOf(iso, NOW)).toBe(expected);
  });

  it("never reads a passed deadline as urgent, even if one is passed in", () => {
    // The review's own finding: a closed deadline must never render red. This
    // is the defensive fallback for a caller (e.g. a detail-pane timeline)
    // that shows a closed appearance's date without checking first.
    expect(urgencyOf("2026-09-10T00:00:00.000Z", NOW)).toBe("none");
  });

  it("is 'none' with no deadline at all", () => {
    expect(urgencyOf(undefined, NOW)).toBe("none");
  });
});

describe("rowDateLabel", () => {
  it("reads 'Today' and 'Tomorrow' for the near cases", () => {
    expect(rowDateLabel("2026-09-15T00:00:00.000Z", NOW)).toBe("Today");
    expect(rowDateLabel("2026-09-16T00:00:00.000Z", NOW)).toBe("Tomorrow");
  });

  it("falls back to an absolute date beyond that", () => {
    expect(rowDateLabel("2026-09-20T00:00:00.000Z", NOW)).toBe("20 Sep");
  });
});
