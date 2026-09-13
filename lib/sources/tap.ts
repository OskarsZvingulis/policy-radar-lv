/**
 * TAP portāls — Tiesību aktu projekti (draft legislation).
 * The mandatory source. See lib/sources/tap-html.ts for why we scrape the
 * HTML listing rather than the JSON:API for ordering.
 */
import type { Item } from "../types";
import { fetchText, parseLvDate } from "./fetch-utils";
import { parseFlextable, absoluteUrl, TAP_BASE } from "./tap-html";

/** How many listing pages (≈20 items each) to pull. 4 pages comfortably
 * covers more than a week of submissions (observed ~55 acts/week), and the
 * relevance engine — not this collector — is responsible for discarding
 * anything outside the window that actually matters for the digest. */
const PAGES = 4;

export async function collectTapLegalActs(): Promise<Item[]> {
  const items: Item[] = [];
  for (let page = 1; page <= PAGES; page++) {
    const url = page === 1 ? `${TAP_BASE}/legal_acts` : `${TAP_BASE}/legal_acts?page=${page}`;
    const html = await fetchText(url);
    const rows = parseFlextable(html);
    // The listing always has rows. Zero parsed rows after a successful fetch
    // means the markup moved under us — report that instead of quietly
    // returning a short digest that looks like a calm week.
    if (rows.length === 0) {
      if (page === 1) throw new Error(`TAP legal_acts returned no parseable rows (markup changed?) at ${url}`);
      break;
    }

    for (const row of rows) {
      const c = row.cells;
      const identificator = (c["Projekta ID"] ?? "").replace(/\(IP\)/g, "").trim();
      const title = c["Tiesību akta nosaukums"] ?? "";
      if (!identificator || !title) continue;

      const sentDate = parseLvDate(c["Nosūtīts (datums)"] ?? "");

      items.push({
        id: `tap_legal_acts:${identificator}`,
        source: "tap_legal_acts",
        sourceLabel: "TAP portāls — Tiesību aktu projekti",
        title: `${identificator}: ${title}`,
        url: absoluteUrl(row.path),
        // The listing does carry real dates for rows that have reached
        // inter-ministry coordination: “Nosūtīts (datums)” is when it went
        // out, “Saskaņošanas termiņš” is the comment deadline — a genuinely
        // actionable date. Rows still at “Iesniegts” carry neither, so those
        // fall back to scrape time, flagged so relevance logic doesn't read a
        // placeholder as a real date.
        date: sentDate ?? new Date().toISOString(),
        dateIsApproximate: sentDate ? undefined : true,
        deadline: parseLvDate(c["Saskaņošanas termiņš"] ?? "") || undefined,
        institution: c["Atbildīgā ministrija"] || undefined,
        stage: c["Virzības stadija"] || undefined,
        text: [title, c["Tiesību akta veids"]].filter(Boolean).join(". "),
      });
    }
  }
  return items;
}
