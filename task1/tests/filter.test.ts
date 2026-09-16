import { describe, it, expect } from "vitest";
import { applyFilters, DEFAULT_FILTER_STATE } from "../lib/digest/filter";
import type { NotRelevantItem, ScoredItem } from "../lib/types";

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

const notRelevant = (over: Partial<NotRelevantItem> & { id: string }): NotRelevantItem => ({
  title: over.id,
  source: "em_news",
  sourceLabel: "Ekonomikas ministrija",
  url: `https://example.lv/${over.id}`,
  date: "2026-09-12T00:00:00.000Z",
  reason: "No topic keywords matched",
  ...over,
});

describe("applyFilters — view", () => {
  const open = item({ id: "open", actionable: true, deadline: "2026-09-20T00:00:00.000Z" });
  const closedWindow = item({ id: "no-window" });
  const items = [open, closedWindow];

  it("'open' view keeps only items with an open window", () => {
    const { items: out } = applyFilters(items, [], { ...DEFAULT_FILTER_STATE, view: "open" }, NOW);
    expect(out.map((i) => i.id)).toEqual(["open"]);
  });

  it("'all' view keeps every relevant item", () => {
    const { items: out } = applyFilters(items, [], { ...DEFAULT_FILTER_STATE, view: "all" }, NOW);
    expect(out.map((i) => i.id).sort()).toEqual(["no-window", "open"]);
  });

  it("'not_relevant' view reports source counts from the excluded items, not zero", () => {
    const nr = [
      notRelevant({ id: "x", source: "em_news", sourceLabel: "Ekonomikas ministrija" }),
      notRelevant({ id: "y", source: "em_news", sourceLabel: "Ekonomikas ministrija" }),
      notRelevant({ id: "z", source: "liaa_news", sourceLabel: "LIAA" }),
    ];
    const { counts } = applyFilters(items, nr, { ...DEFAULT_FILTER_STATE, view: "not_relevant" });
    expect(counts.bySource).toEqual({ em_news: 2, liaa_news: 1 });
  });

  it("'not_relevant' view returns the not-relevant list, not the relevant one", () => {
    const nr = [notRelevant({ id: "excluded" })];
    const { items: out, notRelevantItems } = applyFilters(items, nr, {
      ...DEFAULT_FILTER_STATE,
      view: "not_relevant",
    });
    expect(out).toHaveLength(0);
    expect(notRelevantItems.map((i) => i.id)).toEqual(["excluded"]);
  });
});

describe("applyFilters — source and topic", () => {
  const a = item({ id: "a", source: "liaa_news", sourceLabel: "LIAA", matchedRules: ["Taxation"] });
  const b = item({ id: "b", source: "em_news", sourceLabel: "Ekonomikas ministrija", matchedRules: ["AI"] });
  const items = [a, b];

  it("filters by source", () => {
    const { items: out } = applyFilters(items, [], { ...DEFAULT_FILTER_STATE, view: "all", sources: ["liaa_news"] });
    expect(out.map((i) => i.id)).toEqual(["a"]);
  });

  it("filters by topic", () => {
    const { items: out } = applyFilters(items, [], { ...DEFAULT_FILTER_STATE, view: "all", topics: ["tech"] });
    expect(out.map((i) => i.id)).toEqual(["b"]);
  });

  it("topic counts exclude the topic filter itself, so switching topics can expand the set", () => {
    const { counts } = applyFilters(items, [], { ...DEFAULT_FILTER_STATE, view: "all", topics: ["tech"] });
    expect(counts.byTopic).toEqual({ tax: 1, tech: 1 });
  });

  it("source counts exclude the source filter itself", () => {
    const { counts } = applyFilters(items, [], {
      ...DEFAULT_FILTER_STATE,
      view: "all",
      sources: ["liaa_news"],
    });
    expect(counts.bySource).toEqual({ liaa_news: 1, em_news: 1 });
  });
});

describe("applyFilters — merged acts count toward every source they appeared in", () => {
  // The QA evidence: "TAP portāls: Sabiedrības līdzdalība 0" while 25
  // consultations had genuinely been scanned, because the merged card's
  // single `source` field only ever held its lead copy's source.
  const merged = item({
    id: "tap_legal_acts:26-TA-1",
    source: "tap_legal_acts",
    sourceLabel: "TAP portāls: Tiesību aktu projekti",
    appearances: [
      { source: "tap_legal_acts", sourceLabel: "TAP portāls: Tiesību aktu projekti", url: "https://x/legal", actionable: false },
      {
        source: "tap_consultations",
        sourceLabel: "TAP portāls: Sabiedrības līdzdalība",
        url: "https://x/consult",
        actionable: true,
      },
    ],
  });

  it("counts a merged act under every source it appeared in, not just the lead", () => {
    const { counts } = applyFilters([merged], [], { ...DEFAULT_FILTER_STATE, view: "all" });
    expect(counts.bySource).toEqual({ tap_legal_acts: 1, tap_consultations: 1 });
  });

  it("filtering by a non-lead source still returns the merged act", () => {
    const { items: out } = applyFilters([merged], [], {
      ...DEFAULT_FILTER_STATE,
      view: "all",
      sources: ["tap_consultations"],
    });
    expect(out.map((i) => i.id)).toEqual(["tap_legal_acts:26-TA-1"]);
  });

  it("an item with no appearances still counts under its own single source", () => {
    const plain = item({ id: "plain", source: "liaa_news", sourceLabel: "LIAA" });
    const { counts } = applyFilters([plain], [], { ...DEFAULT_FILTER_STATE, view: "all" });
    expect(counts.bySource).toEqual({ liaa_news: 1 });
  });
});

describe("applyFilters — search", () => {
  const items = [
    item({ id: "a", title: "Infrastruktūra uzņēmējdarbības atbalstam" }),
    item({ id: "b", title: "Par apropriāciju pārdalēm" }),
  ];

  it("query narrows the view counts", () => {
    const { counts } = applyFilters(items, [], { ...DEFAULT_FILTER_STATE, view: "all", query: "uznemejdarbiba" });
    expect(counts.all).toBe(1);
  });

  it("query also narrows the not-relevant count", () => {
    const nr = [notRelevant({ id: "x", title: "Zivsaimniecības noteikumi" }), notRelevant({ id: "y", title: "Cits" })];
    const { counts } = applyFilters([], nr, { ...DEFAULT_FILTER_STATE, view: "all", query: "zivsaimniec" });
    expect(counts.notRelevant).toBe(1);
  });
});
