import { describe, it, expect } from "vitest";
import { scoreItem } from "../lib/relevance/score";
import type { Item } from "../lib/types";

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: "test:1",
    source: "tap_legal_acts",
    sourceLabel: "TAP portāls — Tiesību aktu projekti",
    title: "Neitrāls dokuments",
    url: "https://tapportals.mk.gov.lv/legal_acts/test",
    date: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

describe("scoreItem — core relevance", () => {
  it("flags no topical keywords as not relevant, even with a boost-only match", () => {
    // Only a reading-stage/timing signal, no substantive topic — urgency is
    // not relevance (see keywords.ts's exclusion rationale).
    const result = scoreItem(item({ title: "Kaut kas", stage: "3.lasījums" }));
    expect(result.relevant).toBe(false);
  });

  it("surfaces a genuine topical match above the relevance floor", () => {
    const result = scoreItem(item({ title: "Grozījumi Komerclikumā", text: "komercdarbība" }));
    expect(result.relevant).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(15);
    expect(result.matchedRules).toContain("Company/commercial law");
  });

  it("suppresses an excluded topic even if it weakly overlaps a keyword", () => {
    const result = scoreItem(
      item({ title: "Amatpersonas iecelšana amatā", text: "iecelšana amatā ministrijā" }),
    );
    expect(result.relevant).toBe(false);
  });

  it("does not let an exclusion override a strong startup-law signal", () => {
    const result = scoreItem(
      item({
        title: "Iecelšana amatā jaunuzņēmumu padomē",
        text: "jaunuzņēmumu likums un iecelšana amatā",
      }),
    );
    // hasStrongOverride matches "jaunuzņēmum" — exclusion cap should not apply.
    expect(result.score).toBeGreaterThan(10);
  });
});

describe("scoreItem — boosters", () => {
  it("boosts items naming an ecosystem stakeholder", () => {
    const withEntity = scoreItem(
      item({ title: "Komisijas sēde", text: "nodokļu izmaiņas. Uzaicināti: Fintech Latvija" }),
    );
    const without = scoreItem(item({ title: "Komisijas sēde", text: "nodokļu izmaiņas" }));
    expect(withEntity.score).toBeGreaterThan(without.score);
    expect(withEntity.matchedRules).toContain("Ecosystem stakeholder named");
  });

  it("boosts items from a startup-relevant responsible institution", () => {
    const result = scoreItem(
      item({ title: "Nodokļu izmaiņas", institution: "Ekonomikas ministrija" }),
    );
    expect(result.matchedRules).toContain("Startup-relevant ministry");
  });

  it("labels an upcoming near-final reading differently from one that already happened", () => {
    const future = scoreItem(
      item({ title: "Nodokļu likums", stage: "3.lasījums", date: "2099-01-01T00:00:00Z" }),
    );
    const past = scoreItem(
      item({ title: "Nodokļu likums", stage: "3.lasījums", date: "2020-01-01T00:00:00Z" }),
    );
    expect(future.matchedRules.some((r) => r.includes("upcoming"))).toBe(true);
    expect(past.matchedRules.some((r) => r.includes("already occurred"))).toBe(true);
  });

  it("never reads a scrape-time placeholder date as an upcoming reading", () => {
    const result = scoreItem(
      item({
        title: "Nodokļu likums",
        stage: "3.lasījums",
        date: "2099-01-01T00:00:00Z",
        dateIsApproximate: true,
      }),
    );
    expect(result.matchedRules.some((r) => r.includes("upcoming"))).toBe(false);
  });
});

describe("scoreItem — deadlines and actionability", () => {
  it("marks an item with a real open deadline as actionable", () => {
    const result = scoreItem(
      item({ title: "Nodokļu konsultācija", deadline: "2099-01-01T00:00:00Z" }),
    );
    expect(result.actionable).toBe(true);
    expect(result.matchedRules).toContain("Consultation window open");
  });

  it("does not mark a near-final reading alone as actionable", () => {
    // A founder cannot vote — only a real submission window is actionable.
    const result = scoreItem(
      item({ title: "Nodokļu likums", text: "komercdarbība", stage: "3.lasījums" }),
    );
    expect(result.actionable).toBe(false);
  });

  it("labels a news-source deadline as an application window, not a consultation", () => {
    const result = scoreItem(
      item({ source: "liaa_news", sourceLabel: "LIAA", title: "Atbalsts", deadline: "2099-01-01T00:00:00Z" }),
    );
    expect(result.matchedRules).toContain("Application window open");
  });

  it("does not treat a closed deadline as actionable", () => {
    const result = scoreItem(
      item({ title: "Nodokļu konsultācija", deadline: "2020-01-01T00:00:00Z" }),
    );
    expect(result.actionable).toBe(false);
  });
});

describe("scoreItem — self-mention suppression", () => {
  it("does not credit Altum's own feed for mentioning its own name", () => {
    const result = scoreItem(
      item({ source: "altum_news", sourceLabel: "Altum", title: "Altum jaunumi", text: "Altum piedāvā" }),
    );
    expect(result.matchedRules).not.toContain("Altum instrument");
  });

  it("still credits Altum being mentioned in someone else's feed", () => {
    const result = scoreItem(
      item({ source: "em_news", sourceLabel: "Ekonomikas ministrija", title: "EM atbalsta Altum programmu" }),
    );
    expect(result.matchedRules).toContain("Altum instrument");
  });
});
