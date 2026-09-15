import { describe, it, expect } from "vitest";
import { parseLvDate, extractDeadlinePhrase, htmlToText } from "../lib/sources/fetch-utils";
import { parseLvDateRange } from "../lib/sources/tap-html";

describe("parseLvDate", () => {
  it("parses dd.mm.yyyy into UTC midnight ISO", () => {
    expect(parseLvDate("15.09.2026.")).toBe(new Date(Date.UTC(2026, 8, 15)).toISOString());
  });

  it("returns undefined for unparseable input", () => {
    expect(parseLvDate("not a date")).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(parseLvDate("")).toBeUndefined();
  });
});

describe("parseLvDateRange", () => {
  it("splits a 'from - to' range into two ISO dates", () => {
    const { from, to } = parseLvDateRange("11.09.2026. - 25.09.2026.");
    expect(from).toBe(new Date(Date.UTC(2026, 8, 11)).toISOString());
    expect(to).toBe(new Date(Date.UTC(2026, 8, 25)).toISOString());
  });
});

describe("extractDeadlinePhrase", () => {
  const published = "2026-09-01T00:00:00Z";

  it("extracts a deadline when an application verb is nearby", () => {
    const text = "LIAA aicina piesakīties programmai. Pieteikšanās līdz 24. septembrim.";
    const deadline = extractDeadlinePhrase(text, published);
    expect(deadline).toBe(new Date(Date.UTC(2026, 8, 24)).toISOString());
  });

  it("does not extract a deadline from a plain date-range with no application verb", () => {
    // Real false positive found against the live EM feed: a trade mission's
    // travel dates, not a submission window.
    const text = "Delegācija dosies tirdzniecības misijā no 14. līdz 17. septembrim.";
    expect(extractDeadlinePhrase(text, published)).toBeUndefined();
  });

  it("returns undefined when there is no matching phrase at all", () => {
    expect(extractDeadlinePhrase("Nothing relevant here.", published)).toBeUndefined();
  });

  it("rolls into the next year when the parsed date is far before publication", () => {
    // Published in December, "līdz 15. janvārim" should resolve to the
    // following January, not a date almost a year in the past.
    const decPublished = "2026-12-01T00:00:00Z";
    const text = "Pieteikties var līdz 15. janvārim.";
    const deadline = extractDeadlinePhrase(text, decPublished);
    expect(deadline).toBe(new Date(Date.UTC(2027, 0, 15)).toISOString());
  });
});

describe("htmlToText", () => {
  it("strips tags and decodes the common entities gov.lv sites use", () => {
    expect(htmlToText("<p>A &amp; B&nbsp;&mdash;&nbsp;<b>bold</b></p>".replace("&mdash;", "-"))).toBe(
      "A & B - bold",
    );
  });

  it("removes script and style blocks entirely, not just their tags", () => {
    const html = "<div>keep<script>evil()</script><style>.x{}</style>me</div>";
    expect(htmlToText(html)).toBe("keep me");
  });
});
