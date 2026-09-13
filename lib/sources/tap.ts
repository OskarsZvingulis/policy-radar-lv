/**
 * TAP portāls — Tiesību aktu projekti (draft legislation).
 * The mandatory source. See lib/sources/tap-html.ts for why we scrape the
 * HTML listing rather than the JSON:API for ordering.
 */
import type { Item } from "../types";
import { fetchText } from "./fetch-utils";
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
    if (rows.length === 0) break;

    for (const row of rows) {
      const c = row.cells;
      const identificator = (c["Projekta ID"] ?? "").replace(/\(IP\)/g, "").trim();
      const title = c["Tiesību akta nosaukums"] ?? "";
      if (!identificator || !title) continue;

      items.push({
        id: `tap_legal_acts:${identificator}`,
        source: "tap_legal_acts",
        sourceLabel: "TAP portāls — Tiesību aktu projekti",
        title: `${identificator}: ${title}`,
        url: absoluteUrl(row.path),
        // No reliable per-item date on this listing (see tap-html.ts) — the
        // scrape order itself is the recency signal, so we stamp "now" and
        // let scan order stand in for date within a run.
        date: new Date().toISOString(),
        institution: c["Atbildīgā ministrija"] || undefined,
        stage: c["Virzības stadija"] || undefined,
        text: [title, c["Tiesību akta veids"]].filter(Boolean).join(". "),
      });
    }
  }
  return items;
}
