import { describe, it, expect } from "vitest";
import { dedupeByAct, taIdentificator } from "../lib/digest/run";

/**
 * Regression test for the defect a reviewer spotted unaided on the live page:
 * 26-TA-2087 occupied two of the five top slots because tap_consultations and
 * tap_legal_acts each minted their own id for the same document.
 */

type TestItem = {
  id: string;
  title: string;
  source: string;
  sourceLabel: string;
  url: string;
  score: number;
  deadline?: string;
  actionable: boolean;
  matchedRules: string[];
  alsoSeenIn?: string[];
};

const item = (over: Partial<TestItem> & { id: string; source: string }): TestItem => ({
  title: over.title ?? over.id,
  sourceLabel: over.source,
  url: `https://example.lv/${over.id}`,
  score: 50,
  actionable: Boolean(over.deadline),
  matchedRules: [],
  ...over,
});

describe("taIdentificator", () => {
  it("pulls the TA code out of a collector id", () => {
    expect(taIdentificator({ id: "tap_legal_acts:26-TA-2087", title: "" })).toBe("26-TA-2087");
    expect(taIdentificator({ id: "tap_consultations:26-TA-2087", title: "" })).toBe("26-TA-2087");
    expect(taIdentificator({ id: "tap_mk:26-TA-2109:/meetings/x", title: "" })).toBe("26-TA-2109");
  });

  it("falls back to the title when the id has no code", () => {
    expect(taIdentificator({ id: "em_news:https://x", title: "26-TA-2115: Grozījumi" })).toBe("26-TA-2115");
  });

  it("returns undefined for items with no act code at all", () => {
    expect(taIdentificator({ id: "liaa_news:https://x", title: "LIAA atver uzņemšanu" })).toBeUndefined();
  });

  it("does not partially match a longer number", () => {
    expect(taIdentificator({ id: "x:126-TA-20871", title: "" })).toBeUndefined();
  });
});

const NOW = new Date("2026-09-15T10:00:00Z");

describe("dedupeByAct", () => {
  it("collapses the same act seen from two collectors", () => {
    const out = dedupeByAct([
      item({ id: "tap_legal_acts:26-TA-2087", source: "tap_legal_acts", matchedRules: ["IP"] }),
      item({ id: "tap_consultations:26-TA-2087", source: "tap_consultations", matchedRules: ["IP", "Consultation window open"] }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].matchedRules).toEqual(expect.arrayContaining(["IP", "Consultation window open"]));
  });

  it("keeps the copy that carries a real deadline", () => {
    const out = dedupeByAct([
      item({ id: "tap_legal_acts:26-TA-2087", source: "tap_legal_acts", score: 80 }),
      item({
        id: "tap_consultations:26-TA-2087",
        source: "tap_consultations",
        score: 40,
        deadline: "2026-09-25T00:00:00.000Z",
      }),
    ], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("tap_consultations:26-TA-2087");
    expect(out[0].deadline).toBe("2026-09-25T00:00:00.000Z");
    // the surviving record still reports the best score seen for the act
    expect(out[0].score).toBe(80);
  });

  it("breaks ties on score when neither copy has a deadline", () => {
    const out = dedupeByAct([
      item({ id: "tap_mk:26-TA-2200:/m/1", source: "tap_mk", score: 30 }),
      item({ id: "tap_legal_acts:26-TA-2200", source: "tap_legal_acts", score: 70 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("tap_legal_acts:26-TA-2200");
  });

  it("records the other sources the act was seen in", () => {
    const out = dedupeByAct([
      item({ id: "tap_legal_acts:26-TA-2087", source: "tap_legal_acts" }),
      item({ id: "tap_consultations:26-TA-2087", source: "tap_consultations", deadline: "2026-09-25T00:00:00.000Z" }),
      item({ id: "tap_vss:26-TA-2087:/m/2", source: "tap_vss" }),
    ], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].alsoSeenIn).toEqual(expect.arrayContaining(["tap_legal_acts", "tap_vss"]));
  });

  it("leaves items without an act code untouched", () => {
    const out = dedupeByAct([
      item({ id: "liaa_news:a", source: "liaa_news", title: "LIAA inkubācija" }),
      item({ id: "liaa_news:b", source: "liaa_news", title: "Cits raksts" }),
      item({ id: "saeima_committees:x:1", source: "saeima_committees", title: "Komisijas sēde" }),
    ]);
    expect(out).toHaveLength(3);
  });

  it("shows the earliest open deadline even when that copy isn't the consultation", () => {
    // The QA fix this covers: the old tie-break always preferred a
    // consultation copy outright, so this case would previously have shown
    // the consultation's later date instead of the genuinely soonest one.
    const out = dedupeByAct(
      [
        item({
          id: "tap_legal_acts:26-TA-1",
          source: "tap_legal_acts",
          deadline: "2026-09-16T00:00:00.000Z", // sooner
        }),
        item({
          id: "tap_consultations:26-TA-1",
          source: "tap_consultations",
          deadline: "2026-09-25T00:00:00.000Z", // later, but still open
        }),
      ],
      NOW,
    );
    expect(out[0].deadline).toBe("2026-09-16T00:00:00.000Z");
    expect(out[0].source).toBe("tap_legal_acts");
  });

  it("still uses the open consultation's link even when its own deadline isn't the soonest", () => {
    const out = dedupeByAct(
      [
        item({
          id: "tap_legal_acts:26-TA-1",
          source: "tap_legal_acts",
          url: "https://example.lv/legal-acts-page",
          deadline: "2026-09-16T00:00:00.000Z", // sooner: this is the displayed deadline
        }),
        item({
          id: "tap_consultations:26-TA-1",
          source: "tap_consultations",
          url: "https://example.lv/consultation-page",
          deadline: "2026-09-25T00:00:00.000Z", // later, but open, and it's the actionable page
        }),
      ],
      NOW,
    );
    expect(out[0].deadline).toBe("2026-09-16T00:00:00.000Z");
    expect(out[0].url).toBe("https://example.lv/consultation-page");
  });

  it("falls back to the deadline copy's own URL when no consultation is open", () => {
    const out = dedupeByAct(
      [
        item({
          id: "tap_legal_acts:26-TA-1",
          source: "tap_legal_acts",
          url: "https://example.lv/legal-acts-page",
          deadline: "2026-09-16T00:00:00.000Z",
        }),
        item({
          id: "tap_consultations:26-TA-1",
          source: "tap_consultations",
          url: "https://example.lv/consultation-page",
          deadline: "2026-09-01T00:00:00.000Z", // already closed
        }),
      ],
      NOW,
    );
    expect(out[0].url).toBe("https://example.lv/legal-acts-page");
  });

  it("preserves input order of first appearance", () => {
    const out = dedupeByAct([
      item({ id: "liaa_news:a", source: "liaa_news", title: "first" }),
      item({ id: "tap_legal_acts:26-TA-1", source: "tap_legal_acts", title: "second" }),
      item({ id: "tap_consultations:26-TA-1", source: "tap_consultations", title: "dupe of second" }),
      item({ id: "liaa_news:b", source: "liaa_news", title: "third" }),
    ]);
    // The merged act holds the slot its first copy occupied. Which copy leads
    // the merge is decided on its own merits, not on arrival order, so this
    // asserts position rather than whose title survived.
    expect(out).toHaveLength(3);
    expect(out[0].title).toBe("first");
    expect(taIdentificator(out[1])).toBe("26-TA-1");
    expect(out[2].title).toBe("third");
  });
});
