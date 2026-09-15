import { describe, it, expect } from "vitest";
import { ALL_AXES } from "../lib/relevance/keywords";
import { scoreItem } from "../lib/relevance/score";
import type { Item } from "../lib/types";

/**
 * Latvian declines proper nouns, and a trailing \b in a keyword pattern means
 * only the nominative ever matches. "Altuma programma" and "Altumam" are the
 * forms that actually occur in prose; both failed before this fix, in two
 * separate places — the capital.altum rule and the hasStrongOverride regex —
 * so an item that should have escaped an exclusion via the Altum override
 * didn't either.
 */

const rule = (id: string) => {
  const r = ALL_AXES.find((a) => a.id === id);
  if (!r) throw new Error(`no rule ${id}`);
  return r;
};

const baseItem = (title: string, text = ""): Item => ({
  id: `saeima_committees:test:${title.slice(0, 12)}`,
  source: "saeima_committees",
  sourceLabel: "Saeima: komisiju sēdes",
  title,
  url: "https://example.lv",
  date: new Date().toISOString(),
  text,
});

describe("Latvian inflections in keyword patterns", () => {
  const altum = rule("capital.altum");

  it.each([
    "Altum",
    "Altuma programma",
    "Altumam",
    "Altumu",
    "Altumā",
    "ALTUM finansējums",
    "altuma aizdevums",
  ])("capital.altum matches %s", (form) => {
    expect(altum.pattern.test(form)).toBe(true);
  });

  it("capital.altum still requires a word start", () => {
    expect(altum.pattern.test("kvaltums")).toBe(false);
  });

  const liaa = rule("capital.liaa");

  it.each(["LIAA", "LIAA programma", "LIAAs", "liaa atbalsts"])(
    "capital.liaa matches %s",
    (form) => {
      expect(liaa.pattern.test(form)).toBe(true);
    },
  );

  const ai = rule("market.ai");

  it.each(["mākslīgā intelekta regulējums", "Mākslīgā intelekta stratēģija", "AI Act"])(
    "market.ai matches %s",
    (form) => {
      expect(ai.pattern.test(form)).toBe(true);
    },
  );

  it.each(["ai, cik skaisti", "Ai, nu tā", "tirdzniecības misija"])(
    "market.ai does NOT match the Latvian interjection in %s",
    (form) => {
      expect(ai.pattern.test(form)).toBe(false);
    },
  );
});

describe("hasStrongOverride uses the same inflected forms", () => {
  it("lets an inflected Altum mention escape an exclusion", () => {
    // "apbalvojum" is a ceremonial exclusion; the Altum mention must override it.
    const scored = scoreItem(
      baseItem("Apbalvojums par Altuma programmas ieviešanu", "Altuma finansējuma apbalvojums"),
    );
    expect(scored.matchedRules).toContain("Altum instrument");
    expect(scored.relevant).toBe(true);
  });

  it("still excludes a ceremonial item with no such mention", () => {
    const scored = scoreItem(baseItem("Apbalvojums par ilggadēju darbu", "goda raksts"));
    expect(scored.relevant).toBe(false);
  });
});
