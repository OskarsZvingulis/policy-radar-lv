import { describe, it, expect } from "vitest";
import { matchedTopics, topicLabel, TOPIC_GROUPS } from "../lib/digest/topics";

describe("matchedTopics", () => {
  it("maps funding-axis rules to the funding topic", () => {
    expect(matchedTopics(["Crowdfunding", "EU funds"])).toEqual(["funding"]);
  });

  it("de-duplicates and orders by TOPIC_GROUPS, not input order", () => {
    expect(matchedTopics(["AI", "Taxation", "Fintech / payments"])).toEqual(["tax", "tech"]);
  });

  it("returns an empty array for booster-only matches with no topic", () => {
    expect(matchedTopics(["Ecosystem stakeholder named", "Consultation window open"])).toEqual([]);
  });

  it("ignores an unrecognised label instead of throwing", () => {
    expect(matchedTopics(["Something new nobody mapped yet"])).toEqual([]);
  });
});

describe("topicLabel", () => {
  it("resolves every registered id", () => {
    for (const t of TOPIC_GROUPS) expect(topicLabel(t.id)).toBe(t.label);
  });

  it("falls back to the id itself for an unknown one", () => {
    expect(topicLabel("nonexistent")).toBe("nonexistent");
  });
});
