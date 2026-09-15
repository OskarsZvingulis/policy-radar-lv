import { describe, it, expect } from "vitest";
import { daysFromToday, absoluteDay, deadlinePhrase, pastPhrase } from "../lib/relative-date";

const NOW = new Date("2026-09-15T09:30:00.000Z");

describe("daysFromToday", () => {
  it("counts whole calendar days, ignoring time of day", () => {
    // The deadline is stored at UTC midnight and "now" is mid-morning; an
    // instant comparison would call this -1 (yesterday) rather than 0.
    expect(daysFromToday("2026-09-15T00:00:00.000Z", NOW)).toBe(0);
    expect(daysFromToday("2026-09-16T00:00:00.000Z", NOW)).toBe(1);
    expect(daysFromToday("2026-09-14T23:59:00.000Z", NOW)).toBe(-1);
  });

  it("returns undefined for an unparseable date", () => {
    expect(daysFromToday("not a date", NOW)).toBeUndefined();
  });
});

describe("deadlinePhrase", () => {
  it.each([
    ["2026-09-15T00:00:00.000Z", "closes today"],
    ["2026-09-16T00:00:00.000Z", "1 day left"],
    ["2026-09-18T00:00:00.000Z", "3 days left"],
    ["2026-09-22T00:00:00.000Z", "7 days left"],
    ["2026-09-14T00:00:00.000Z", "closed"],
  ])("%s reads as %s", (iso, expected) => {
    expect(deadlinePhrase(iso, NOW)).toBe(expected);
  });

  it("switches to an absolute date once the countdown stops being useful", () => {
    expect(deadlinePhrase("2026-10-03T00:00:00.000Z", NOW)).toBe("closes 3 Oct");
  });
});

describe("pastPhrase", () => {
  it.each([
    ["2026-09-15T00:00:00.000Z", "today"],
    ["2026-09-14T00:00:00.000Z", "yesterday"],
    ["2026-09-11T00:00:00.000Z", "4 days ago"],
    ["2026-09-17T00:00:00.000Z", "in 2 days"],
  ])("%s reads as %s", (iso, expected) => {
    expect(pastPhrase(iso, NOW)).toBe(expected);
  });

  it("falls back to an absolute date beyond a week", () => {
    expect(pastPhrase("2026-07-06T00:00:00.000Z", NOW)).toBe("6 Jul");
  });
});

describe("absoluteDay", () => {
  it("omits the year when it is the current one", () => {
    expect(absoluteDay("2026-09-15T00:00:00.000Z", NOW)).toBe("15 Sep");
  });

  it("includes the year when it differs", () => {
    expect(absoluteDay("2027-01-04T00:00:00.000Z", NOW)).toBe("4 Jan 2027");
  });
});
