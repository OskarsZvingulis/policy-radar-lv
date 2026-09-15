import { describe, it, expect, vi, afterEach } from "vitest";
import { dedupeByAct } from "../lib/digest/run";
import { collectAltumNews } from "../lib/sources/rss";
import { scoreItem } from "../lib/relevance/score";
import { describeItemDates } from "../lib/dates";
import { deadlinePhrase } from "../lib/relative-date";
import type { Item } from "../lib/types";

/**
 * Reproductions for the second external review. Each one failed before the
 * corresponding fix; they exist so the same defect cannot come back quietly.
 */

const NOW = new Date("2026-09-15T10:00:00Z");

type Copy = {
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
  appearances?: { source: string; sourceLabel: string; url: string; deadline?: string; actionable: boolean }[];
};

const acted = (over: Partial<Copy> & { id: string; sourceLabel: string; url: string }): Copy => ({
  title: "26-TA-0: X",
  source: over.id.split(":")[0],
  score: 40,
  actionable: false,
  matchedRules: [],
  ...over,
});

describe("B1 dedupe keeps the deadline that can still be acted on", () => {
  it("prefers the open consultation over a legal-act copy whose window has closed", () => {
    const legal = acted({
      id: "tap_legal_acts:26-TA-2087",
      title: "26-TA-2087: X",
      sourceLabel: "legal",
      url: "https://tapportals.mk.gov.lv/legal_acts/x",
      deadline: "2026-09-10T00:00:00.000Z",
      actionable: false,
    });
    const consult = acted({
      id: "tap_consultations:26-TA-2087",
      title: "26-TA-2087: X",
      sourceLabel: "consult",
      url: "https://tapportals.mk.gov.lv/public_participation/x",
      deadline: "2026-09-20T00:00:00.000Z",
      actionable: true,
    });

    const [merged] = dedupeByAct([legal, consult], NOW);
    expect(merged.actionable).toBe(true);
    expect(merged.deadline).toBe("2026-09-20T00:00:00.000Z");
  });

  it("surfaces the earliest open deadline, not the first source listed", () => {
    // The real defect: the 15 Sep consultation was merged away and the card
    // showed the 16 Sep ministry coordination date instead.
    const legal = acted({
      id: "tap_legal_acts:26-TA-2087",
      title: "26-TA-2087: X",
      sourceLabel: "legal",
      url: "https://tapportals.mk.gov.lv/legal_acts/x",
      deadline: "2026-09-16T00:00:00.000Z",
      actionable: true,
    });
    const consult = acted({
      id: "tap_consultations:26-TA-2087",
      title: "26-TA-2087: X",
      sourceLabel: "consult",
      url: "https://tapportals.mk.gov.lv/public_participation/x",
      deadline: "2026-09-15T00:00:00.000Z",
      actionable: true,
    });

    const [merged] = dedupeByAct([legal, consult], NOW);
    expect(merged.deadline).toBe("2026-09-15T00:00:00.000Z");
    expect(merged.url).toContain("public_participation");
  });

  it("produces the same merge whichever order the copies arrive in", () => {
    const build = () => [
      acted({
        id: "tap_legal_acts:26-TA-9",
        title: "26-TA-9: X",
        sourceLabel: "legal",
        url: "https://x/legal",
        deadline: "2026-09-18T00:00:00.000Z",
        actionable: true,
      }),
      acted({
        id: "tap_consultations:26-TA-9",
        title: "26-TA-9: X",
        sourceLabel: "consult",
        url: "https://x/consult",
        deadline: "2026-09-17T00:00:00.000Z",
        actionable: true,
      }),
      acted({ id: "tap_vss:26-TA-9:/m/1", title: "26-TA-9: X", sourceLabel: "VSS", url: "https://x/vss" }),
    ];
    const forward = dedupeByAct(build(), NOW);
    const reversed = dedupeByAct(build().reverse(), NOW);
    expect(forward).toHaveLength(1);
    expect(reversed).toHaveLength(1);
    expect(reversed[0].deadline).toBe(forward[0].deadline);
    expect(reversed[0].url).toBe(forward[0].url);
  });

  it("does not list the card's own source under alsoSeenIn", () => {
    const a = acted({ id: "tap_vss:26-TA-1:/m/1", title: "26-TA-1: X", sourceLabel: "VSS", url: "https://x/1" });
    const b = acted({ id: "tap_vss:26-TA-1:/m/2", title: "26-TA-1: X", sourceLabel: "VSS", url: "https://x/2" });
    const [merged] = dedupeByAct([a, b], NOW);
    expect(merged.alsoSeenIn ?? []).not.toContain(merged.sourceLabel);
  });

  it("keeps every appearance so the detail view can show all of them", () => {
    const legal = acted({
      id: "tap_legal_acts:26-TA-5",
      title: "26-TA-5: X",
      sourceLabel: "legal",
      url: "https://x/legal",
      deadline: "2026-09-18T00:00:00.000Z",
      actionable: true,
    });
    const consult = acted({
      id: "tap_consultations:26-TA-5",
      title: "26-TA-5: X",
      sourceLabel: "consult",
      url: "https://x/consult",
      deadline: "2026-09-17T00:00:00.000Z",
      actionable: true,
    });
    const [merged] = dedupeByAct([legal, consult], NOW);
    expect(merged.appearances).toHaveLength(2);
    expect(merged.appearances!.map((a) => a.sourceLabel).sort()).toEqual(["consult", "legal"]);
  });
});

describe("B4 one malformed RSS date does not fail the whole feed", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the good items and stamps the bad one as approximate", async () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><title>Good</title><link>https://www.altum.lv/a</link><pubDate>Mon, 14 Sep 2026 10:00:00 +0300</pubDate></item>
      <item><title>Bad</title><link>https://www.altum.lv/b</link><pubDate>not a date</pubDate></item>
    </channel></rss>`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(xml, { status: 200 })));

    const items = await collectAltumNews();
    expect(items).toHaveLength(2);
    expect(items[1].dateIsApproximate).toBe(true);
    expect(Number.isNaN(new Date(items[1].date).getTime())).toBe(false);
  });

  it("drops a non-http link rather than rendering it", async () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><title>Bad link</title><link>javascript:alert(1)</link><pubDate>Mon, 14 Sep 2026 10:00:00 +0300</pubDate></item>
    </channel></rss>`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(xml, { status: 200 })));

    const items = await collectAltumNews();
    expect(items[0].url).toBe("");
  });

  it("decodes HTML entities in the title", async () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><title>Atbalsts uzņēmumiem &amp;amp; jaunuzņēmumiem</title><link>https://www.altum.lv/a</link><pubDate>Mon, 14 Sep 2026 10:00:00 +0300</pubDate></item>
    </channel></rss>`;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(xml, { status: 200 })));

    const items = await collectAltumNews();
    expect(items[0].title).toContain("&");
    expect(items[0].title).not.toContain("&amp;");
  });
});

describe("B6 the AI axis survives all-caps Latvian", () => {
  const item = (title: string): Item => ({
    id: "em_news:x",
    source: "em_news",
    sourceLabel: "Ekonomikas ministrija",
    title,
    url: "https://www.em.gov.lv/x",
    date: NOW.toISOString(),
  });

  it("matches an all-caps headline", () => {
    expect(scoreItem(item("MĀKSLĪGAIS INTELEKTS UZŅĒMUMOS")).matchedRules).toContain("AI");
  });

  it("still matches ordinary sentence case", () => {
    expect(scoreItem(item("Mākslīgā intelekta regulējums")).matchedRules).toContain("AI");
  });

  it("still ignores the Latvian interjection", () => {
    expect(scoreItem(item("Ai, cik skaisti ziedi pļavā")).matchedRules).not.toContain("AI");
  });
});

describe("B7 agriculture exclusion reads the whole haystack", () => {
  const agri = (body: string): Item => ({
    id: "tap_legal_acts:26-TA-77",
    source: "tap_legal_acts",
    sourceLabel: "TAP portāls: Tiesību aktu projekti",
    title: "26-TA-77: Grozījumi lauksaimniecības noteikumos",
    url: "https://tapportals.mk.gov.lv/legal_acts/x",
    date: NOW.toISOString(),
    text: body,
  });

  it("still excludes agriculture with no funding angle", () => {
    expect(scoreItem(agri("Par zemes izmantošanas kārtību")).relevant).toBe(false);
  });

  it("lets a funding angle mentioned in the body escape the exclusion", () => {
    // The haystack joins title and body with a newline. Before the fix the
    // lookahead stopped at that newline and never saw "valsts atbalsts".
    const scored = scoreItem(agri("Paredzēts valsts atbalsts un Altuma aizdevumi uzņēmumiem"));
    expect(scored.matchedRules.length).toBeGreaterThan(0);
    expect(scored.relevant).toBe(true);
  });
});

describe("C5 day boundaries follow Riga, not UTC", () => {
  it("treats 01:00 Riga as the new day, which UTC still calls yesterday", () => {
    // 2026-09-16T01:30+03:00 is 2026-09-15T22:30Z. The reader is on the 16th.
    const earlyRigaMorning = new Date("2026-09-15T22:30:00Z");
    const closesOnThe16th = "2026-09-16T00:00:00.000Z";
    expect(deadlinePhrase(closesOnThe16th, earlyRigaMorning)).toBe("closes today");
  });

  it("a window that closed yesterday in Riga reads as closed", () => {
    const earlyRigaMorning = new Date("2026-09-15T22:30:00Z");
    expect(deadlinePhrase("2026-09-15T00:00:00.000Z", earlyRigaMorning)).toBe("closed");
  });
});

describe("C2 a closed deadline is not presented as something to act on", () => {
  it("does not label a passed date as a deadline", () => {
    const dates = describeItemDates(
      { source: "tap_legal_acts", date: NOW.toISOString(), deadline: "2026-09-01T00:00:00.000Z" },
      NOW,
    );
    const stillADeadline = dates.find((d) => d.isDeadline);
    expect(stillADeadline).toBeUndefined();
  });

  it("keeps labelling an open one", () => {
    const dates = describeItemDates(
      { source: "tap_consultations", date: NOW.toISOString(), deadline: "2026-09-20T00:00:00.000Z" },
      NOW,
    );
    const open = dates.find((d) => d.isDeadline);
    expect(open).toBeDefined();
    expect(deadlinePhrase(open!.iso, NOW)).toBe("5 days left");
  });
});
