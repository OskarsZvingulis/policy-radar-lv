/**
 * TAP portāls — Sabiedrības līdzdalība (public participation / consultations).
 * This is the most actionable feed of the seven: it carries a hard deadline,
 * which is exactly the "act now, by this date" signal the manual weekly
 * check is too slow to surface reliably.
 */
import type { Item } from "../types";
import { fetchText } from "./fetch-utils";
import { parseFlextable, parseLvDateRange, absoluteUrl, TAP_BASE } from "./tap-html";

export async function collectTapConsultations(): Promise<Item[]> {
  const html = await fetchText(`${TAP_BASE}/public_participation`);
  const rows = parseFlextable(html);
  const items: Item[] = [];

  for (const row of rows) {
    const c = row.cells;
    const identificator = (c["Projekta ID/ Uzdevuma numurs"] ?? "").trim();
    const title = c["Tiesību akta/ diskusiju dokumenta nosaukums"] ?? "";
    if (!identificator || !title) continue;

    const { from, to } = parseLvDateRange(c["Termiņš"] ?? "");

    items.push({
      id: `tap_consultations:${identificator}`,
      source: "tap_consultations",
      sourceLabel: "TAP portāls — Sabiedrības līdzdalība",
      title: `${identificator}: ${title}`,
      url: absoluteUrl(row.path),
      date: from ?? new Date().toISOString(),
      deadline: to,
      institution: c["Atbildīgā ministrija"] || undefined,
      stage: c["Līdzdalības veids"] || undefined,
      text: title,
    });
  }
  return items;
}
