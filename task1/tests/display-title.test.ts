import { describe, it, expect } from "vitest";
import { displayTitle, stripActCode, quotedSegments } from "../lib/display-title";

/**
 * Cases are real titles taken from samples/digest-2026-09-14.json, not
 * invented ones — the whole point is that this survives actual Latvian
 * government drafting rather than a tidy fixture.
 */

const EU_FUNDS_TITLE =
  '26-TA-2115: Grozījumi Ministru kabineta 2024. gada 16. janvāra noteikumos Nr. 55 "Eiropas Savienības kohēzijas politikas programmas 2021.–2027. gadam 5.1.1. specifiskā atbalsta mērķa "Vietējās teritorijas integrētās sociālās, ekonomiskās un vides attīstības un kultūras mantojuma, tūrisma un drošības veicināšana pilsētu funkcionālajās teritorijās" 5.1.1.1. pasākuma "Infrastruktūra uzņēmējdarbības atbalstam" īstenošanas noteikumi"';

const CROWDFUNDING_TITLE =
  'Budžeta un finanšu (nodokļu) komisijas sēde: Likumprojekts “Grozījumi Kolektīvās finansēšanas pakalpojumu likumā” (Nr.1393/Lp14; 3.lasījums).';

describe("stripActCode", () => {
  it("removes a leading TA identifier", () => {
    expect(stripActCode("26-TA-2115: Grozījumi")).toBe("Grozījumi");
  });

  it("removes one carrying an (IP) marker", () => {
    expect(stripActCode("26-TA-2254 (IP) Informatīvais ziņojums")).toBe("Informatīvais ziņojums");
  });

  it("leaves a title with no code alone", () => {
    expect(stripActCode("LIAA atver uzņemšanu")).toBe("LIAA atver uzņemšanu");
  });
});

describe("quotedSegments", () => {
  it("surfaces the programme name as one of the segments", () => {
    const spans = quotedSegments(EU_FUNDS_TITLE);
    expect(spans).toContain("Infrastruktūra uzņēmējdarbības atbalstam");
  });

  it("handles curly quotes", () => {
    expect(quotedSegments('Likumprojekts “Grozījumi Reklāmas likumā”')).toContain(
      "Grozījumi Reklāmas likumā",
    );
  });

  it("returns the whole string when there are no quotes", () => {
    expect(quotedSegments("Par apropriāciju pārdalēm")).toEqual(["Par apropriāciju pārdalēm"]);
  });
});

describe("displayTitle", () => {
  it("pulls the programme name out of nested amendment boilerplate", () => {
    const { text, shortened } = displayTitle(EU_FUNDS_TITLE);
    expect(text).toBe("Infrastruktūra uzņēmējdarbības atbalstam");
    expect(shortened).toBe(true);
  });

  it("pulls the bill name out of a committee agenda line", () => {
    const { text } = displayTitle(CROWDFUNDING_TITLE);
    expect(text).toBe("Grozījumi Kolektīvās finansēšanas pakalpojumu likumā");
  });

  it("never returns something longer than the cap", () => {
    const { text } = displayTitle(EU_FUNDS_TITLE);
    expect(text.length).toBeLessThanOrEqual(91); // 90 + ellipsis
  });

  it("falls back to the head of the title when there are no usable quotes", () => {
    const plain =
      "26-TA-2079: Par Ministru kabineta atbildes vēstules projektu Saeimas Budžeta un finanšu komisijai par kaut ko ļoti garu un nevajadzīgu";
    const { text } = displayTitle(plain);
    expect(text.startsWith("Par Ministru kabineta atbildes vēstules projektu")).toBe(true);
    expect(text.length).toBeLessThanOrEqual(91);
  });

  it("leaves an already-short news headline essentially alone", () => {
    const headline = "LIAA atver rudens uzņemšanu Biznesa inkubācijas programmā";
    expect(displayTitle(headline).text).toBe(headline);
  });

  it("does not return an empty string for any real sample title", async () => {
    const { readFileSync } = await import("node:fs");
    const digest = JSON.parse(readFileSync("samples/digest-2026-09-14.json", "utf8"));
    for (const item of digest.scored as { title: string }[]) {
      const { text } = displayTitle(item.title);
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text.length).toBeLessThanOrEqual(91);
    }
  });
});
