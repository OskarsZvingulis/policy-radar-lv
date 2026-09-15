import { describe, it, expect } from "vitest";
import {
  isDeadlineStillOpen,
  isTodayOrLater,
  isWithinTrailingDays,
  describeItemDates,
} from "../lib/dates";

// Fixed reference "now" so these tests don't depend on the wall clock —
// 2026-09-15T10:00:00Z, mid-week, matching the real run this repo ships
// samples for.
const NOW = new Date("2026-09-15T10:00:00Z");

describe("isDeadlineStillOpen", () => {
  it("is open on the deadline's own calendar day, even in the evening UTC", () => {
    // A consultation closing "today" must not read as already closed just
    // because it's afternoon — the whole day counts (see lib/dates.ts).
    expect(isDeadlineStillOpen("2026-09-15T00:00:00Z", NOW)).toBe(true);
  });

  it("is closed the day after the deadline", () => {
    expect(isDeadlineStillOpen("2026-09-14T00:00:00Z", NOW)).toBe(false);
  });

  it("is open for a future deadline", () => {
    expect(isDeadlineStillOpen("2026-09-20T00:00:00Z", NOW)).toBe(true);
  });

  it("is false with no deadline", () => {
    expect(isDeadlineStillOpen(undefined, NOW)).toBe(false);
  });

  it("closes at Riga midnight, not UTC midnight", () => {
    // 21:00 UTC on the 15th is exactly 00:00 in Riga (UTC+3 in September) —
    // the day has turned over locally even though the UTC date hasn't. A
    // deadline stamped for the 15th must already read closed here, the same
    // moment daysFromToday starts calling it "yesterday".
    const rigaMidnight = new Date("2026-09-15T21:00:00Z");
    expect(isDeadlineStillOpen("2026-09-15T00:00:00Z", rigaMidnight)).toBe(false);
    // One minute earlier it's still the 15th in Riga, so still open.
    const oneMinuteBefore = new Date("2026-09-15T20:59:00Z");
    expect(isDeadlineStillOpen("2026-09-15T00:00:00Z", oneMinuteBefore)).toBe(true);
  });
});

describe("isTodayOrLater", () => {
  it("treats today as today-or-later", () => {
    expect(isTodayOrLater("2026-09-15T23:00:00Z", NOW)).toBe(true);
  });

  it("treats yesterday as in the past", () => {
    expect(isTodayOrLater("2026-09-14T23:59:00Z", NOW)).toBe(false);
  });
});

describe("isWithinTrailingDays", () => {
  it("includes exactly the boundary day of a 7-day window", () => {
    // NOW is 2026-09-15; a 7-day trailing window should include 2026-09-09
    // (today minus 6 days) but not 2026-09-08.
    expect(isWithinTrailingDays("2026-09-09T00:00:00Z", 7, NOW)).toBe(true);
    expect(isWithinTrailingDays("2026-09-08T23:00:00Z", 7, NOW)).toBe(false);
  });

  it("is false for an undefined date", () => {
    expect(isWithinTrailingDays(undefined, 7, NOW)).toBe(false);
  });
});

describe("describeItemDates", () => {
  it("labels a TAP consultation deadline distinctly from a comment deadline", () => {
    const [d] = describeItemDates({
      source: "tap_consultations",
      date: "2026-09-01T00:00:00Z",
      deadline: "2026-09-20T00:00:00Z",
    });
    expect(d.label).toBe("Consultation deadline");
    expect(d.isDeadline).toBe(true);
  });

  it("labels a news-source deadline as an application deadline", () => {
    const [d] = describeItemDates({
      source: "liaa_news",
      date: "2026-09-01T00:00:00Z",
      deadline: "2026-09-20T00:00:00Z",
    });
    expect(d.label).toBe("Application deadline");
  });

  it("suppresses the publish/meeting date when it's only a scrape-time placeholder", () => {
    const dates = describeItemDates({
      source: "tap_legal_acts",
      date: "2026-09-15T00:00:00Z",
      dateIsApproximate: true,
    });
    expect(dates).toHaveLength(0);
  });

  it("labels a meeting source's date as a meeting date, not Published", () => {
    const dates = describeItemDates({ source: "tap_mk", date: "2026-09-10T00:00:00Z" });
    expect(dates[0].label).toBe("Meeting date");
  });
});
