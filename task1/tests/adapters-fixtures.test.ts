import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseFlextable, parseLvDateRange } from "../lib/sources/tap-html";
import { parseDayListing } from "../lib/sources/saeima";

/**
 * Fixture-based parser tests on saved real pages (captured 2026-09-15) — the
 * brief's requirement that a site markup change shows up as a failing test,
 * not a silently empty digest. These test the parsing logic only, no
 * network calls.
 */
describe("parseFlextable — TAP public_participation fixture", () => {
  const html = readFileSync("tests/fixtures/tap-public-participation.html", "utf8");
  const rows = parseFlextable(html);

  it("parses every listing row on the page", () => {
    expect(rows.length).toBe(25);
  });

  it("extracts the expected cell columns from the first row", () => {
    const [first] = rows;
    expect(first.path).toMatch(/^\/public_participation\/[0-9a-f-]{36}$/);
    expect(first.cells["Projekta ID/ Uzdevuma numurs"]).toBeTruthy();
    expect(first.cells["Tiesību akta/ diskusiju dokumenta nosaukums"]).toBeTruthy();
    expect(first.cells["Atbildīgā ministrija"]).toBeTruthy();
  });

  it("carries a parseable deadline range in every row that has one", () => {
    const withTermins = rows.filter((r) => r.cells["Termiņš"]);
    expect(withTermins.length).toBeGreaterThan(0);
    for (const row of withTermins) {
      const { from, to } = parseLvDateRange(row.cells["Termiņš"]);
      expect(from).toBeTruthy();
      expect(to).toBeTruthy();
    }
  });
});

describe("parseDayListing — Saeima Domino fixture", () => {
  const html = readFileSync("tests/fixtures/saeima-day-listing.html", "utf8");
  const entries = parseDayListing(html);

  it("parses every committee sitting listed for the day", () => {
    expect(entries.length).toBe(14);
  });

  it("extracts a stable unid and non-empty title for each entry", () => {
    for (const e of entries) {
      expect(e.unid).toMatch(/^[0-9A-F]+$/);
      expect(e.title.length).toBeGreaterThan(0);
    }
  });

  it("finds the known Budget and Finance (tax) committee sitting", () => {
    const budget = entries.find((e) => e.title.includes("Budžeta un finanšu"));
    expect(budget).toBeDefined();
    expect(budget?.unid).toBe("6F7C1AA20FEA7CBCC2258E6600492A62");
  });
});
