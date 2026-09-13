/**
 * TAP portāls — Valsts sekretāru sanāksme (VSS) and Ministru kabineta sēdes (MK).
 *
 * The listing page only gives a generic meeting title ("Valsts sekretāru
 * 10.09.2026. sanāksme"), which carries no signal on its own. The actual
 * value is the agenda: each meeting detail page embeds a table of draft acts
 * on the agenda, each linking to its /legal_acts/{uuid} record. We surface
 * one Item per agenda entry — "this act is up for VSS/MK review this week" —
 * rather than one generic Item per meeting.
 */
import type { Item, SourceId } from "../types";
import { fetchText, parseLvDate } from "./fetch-utils";
import { parseFlextable, absoluteUrl, TAP_BASE } from "./tap-html";

export type MeetingKind = "state_secretaries" | "cabinet_ministers";

const CONFIG: Record<
  MeetingKind,
  { source: SourceId; label: string; stage: string; listingPath: string }
> = {
  state_secretaries: {
    source: "tap_vss",
    label: "Valsts sekretāru sanāksme",
    stage: "Valsts sekretāru sanāksme",
    listingPath: "/meetings/state_secretaries",
  },
  cabinet_ministers: {
    source: "tap_mk",
    label: "Ministru kabineta sēde",
    stage: "Ministru kabineta sēde",
    listingPath: "/meetings/cabinet_ministers",
  },
};

/** How many most-recent meeting occurrences to open and parse the agenda of. */
const RECENT_MEETINGS = 3;

const AGENDA_ITEM_RE = /<a href="(\/legal_acts\/[0-9a-f-]{36})"[^>]*>(\d{2}-TA-\d+)<\/a>/g;

function extractAgendaItems(html: string): { path: string; identificator: string; question: string }[] {
  const out: { path: string; identificator: string; question: string }[] = [];
  for (const m of html.matchAll(AGENDA_ITEM_RE)) {
    const afterIdx = m.index! + m[0].length;
    const chunk = html.slice(afterIdx, afterIdx + 4000);
    const qMatch = chunk.match(
      /data-column-header-name="Jautājums">([\s\S]*?)(?:<div class="grid meeting-question__document-summary">|data-column-header-name="Ziņo")/,
    );
    const question = qMatch
      ? qMatch[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&")
          .replace(/\s+/g, " ")
          .trim()
      : "";
    out.push({ path: m[1], identificator: m[2], question });
  }
  return out;
}

export async function collectTapMeetings(kind: MeetingKind): Promise<Item[]> {
  const cfg = CONFIG[kind];
  const listingHtml = await fetchText(`${TAP_BASE}${cfg.listingPath}`);
  const rows = parseFlextable(listingHtml).slice(0, RECENT_MEETINGS);

  const items: Item[] = [];
  for (const row of rows) {
    const dateText = row.cells["Datums"] ?? "";
    const meetingDate = parseLvDate(dateText) ?? new Date().toISOString();
    let detailHtml: string;
    try {
      detailHtml = await fetchText(absoluteUrl(row.path));
    } catch {
      continue; // one bad meeting page shouldn't sink the whole source
    }
    const agenda = extractAgendaItems(detailHtml);

    if (agenda.length === 0) {
      // No parseable agenda (e.g. protocol not yet published) — still
      // surface the meeting itself so it isn't silently dropped.
      items.push({
        id: `${cfg.source}:${row.path}`,
        source: cfg.source,
        sourceLabel: cfg.label,
        title: row.cells["Nosaukums"] || cfg.label,
        url: absoluteUrl(row.path),
        date: meetingDate,
        stage: cfg.stage,
      });
      continue;
    }

    for (const a of agenda) {
      items.push({
        id: `${cfg.source}:${a.identificator}:${row.path}`,
        source: cfg.source,
        sourceLabel: cfg.label,
        title: `${a.identificator}: ${a.question || row.cells["Nosaukums"] || ""}`,
        url: absoluteUrl(a.path),
        date: meetingDate,
        stage: cfg.stage,
        text: a.question,
      });
    }
  }
  return items;
}
