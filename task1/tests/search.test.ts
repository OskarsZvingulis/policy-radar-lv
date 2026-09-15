import { describe, it, expect } from "vitest";
import { normalizeForSearch, matchesQuery } from "../lib/digest/search";

describe("normalizeForSearch", () => {
  it("strips Latvian diacritics", () => {
    expect(normalizeForSearch("uzņēmējdarbība")).toBe("uznemejdarbiba");
  });

  it("is case-insensitive", () => {
    expect(normalizeForSearch("ALTUM")).toBe(normalizeForSearch("altum"));
  });
});

describe("matchesQuery", () => {
  const item = {
    title: "Infrastruktūra uzņēmējdarbības atbalstam",
    fullTitle: "26-TA-2115: Grozījumi ... Infrastruktūra uzņēmējdarbības atbalstam",
    institution: "Ekonomikas ministrija",
    sourceLabel: "TAP portāls: Tiesību aktu projekti",
    topics: ["Funding"],
  };

  it("matches an ASCII query against a diacritic title", () => {
    expect(matchesQuery(item, "uznemejdarbiba")).toBe(true);
  });

  it("matches an act number that only appears in the full title", () => {
    expect(matchesQuery(item, "26-TA-2115")).toBe(true);
  });

  it("matches by topic label", () => {
    expect(matchesQuery(item, "funding")).toBe(true);
  });

  it("matches by institution", () => {
    expect(matchesQuery(item, "ekonomikas")).toBe(true);
  });

  it("returns false for a genuinely absent term", () => {
    expect(matchesQuery(item, "zivsaimniecība")).toBe(false);
  });

  it("treats an empty query as matching everything", () => {
    expect(matchesQuery(item, "")).toBe(true);
    expect(matchesQuery(item, "   ")).toBe(true);
  });
});
