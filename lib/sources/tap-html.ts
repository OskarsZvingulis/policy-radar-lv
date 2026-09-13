/**
 * Shared parser for tapportals.mk.gov.lv's server-rendered listing tables.
 *
 * /legal_acts, /public_participation, /meetings/state_secretaries and
 * /meetings/cabinet_ministers all render the exact same "flextable" markup:
 * a header row followed by sibling rows shaped like
 *
 *   <div class="... flextable__row ..." data-url="/legal_acts/{uuid}" data-linkable-row="true">
 *     <div ... data-column-header-name="Projekta ID"><span class="flextable__value">26-TA-2254</span></div>
 *     ...
 *   </div>
 *
 * This also settles a real discrepancy found while probing the site: the
 * `/api/v1/legal_acts` JSON:API's default ordering is NOT chronological
 * (page 1 opened on "26-TA-999", an old item, while `sort=` is silently
 * ignored) but this HTML listing IS reverse-chronological by default — it's
 * literally what a human checking the portal sees. So the digest treats this
 * listing as the authoritative recency index and only reaches for the JSON
 * API when it needs something the table doesn't carry (this prototype
 * doesn't need to, since the table already carries title/stage/institution/
 * deadline for every source we scrape this way).
 */

import { htmlToText, parseLvDate } from "./fetch-utils";

export interface FlextableRow {
  /** Absolute path from data-url, e.g. "/legal_acts/{uuid}" */
  path: string;
  cells: Record<string, string>;
}

const ROW_START_RE =
  /<div class="grid grid--wrap grid--row flextable__row[^"]*"[^>]*\sdata-url="([^"]+)"/g;
const CELL_RE =
  /data-column-header-name="([^"]+)"[^>]*><span class="flextable__value">([\s\S]*?)<\/span>\s*<\/div>/g;

export function parseFlextable(html: string): FlextableRow[] {
  const starts: { index: number; path: string }[] = [];
  for (const m of html.matchAll(ROW_START_RE)) {
    starts.push({ index: m.index, path: m[1] });
  }

  const rows: FlextableRow[] = [];
  for (let i = 0; i < starts.length; i++) {
    const begin = starts[i].index;
    const end = i + 1 < starts.length ? starts[i + 1].index : html.length;
    const body = html.slice(begin, end);
    const cells: Record<string, string> = {};
    for (const cm of body.matchAll(CELL_RE)) {
      cells[cm[1]] = htmlToText(cm[2]);
    }
    rows.push({ path: starts[i].path, cells });
  }
  return rows;
}

/** "11.09.2026. - 25.09.2026." → { from, to } as ISO dates. */
export function parseLvDateRange(s: string): { from?: string; to?: string } {
  const parts = s.split("-").map((p) => p.trim());
  return { from: parseLvDate(parts[0] ?? ""), to: parseLvDate(parts[1] ?? "") };
}

const BASE = "https://tapportals.mk.gov.lv";

export function absoluteUrl(path: string): string {
  return path.startsWith("http") ? path : `${BASE}${path}`;
}

export { BASE as TAP_BASE };
