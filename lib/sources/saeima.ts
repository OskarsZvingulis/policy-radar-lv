/**
 * Saeima — Komisiju sēžu darba kārtības (committee meeting agendas).
 *
 * titania.saeima.lv is a Lotus Notes / Domino web export: no JSON API, and
 * the agenda body is `<font>`-tag soup rather than semantic markup. Each
 * agenda entry is reliably prefixed with a bold "N. " marker
 * (`<b><font size="4"...>N. </font></b>`), which is the one stable anchor we
 * split on.
 *
 * The daily listing view (`webComisDK`) takes a `restricttocategory=DD.MM.YYYY`
 * date and returns `draw_PE({...})` JS-literal calls, one per committee
 * sitting that day.
 *
 * Earlier version of this collector stopped after finding 2 "active"
 * sitting days walking backward from today, on the assumption committees
 * mostly sit twice a week — in practice a single real week had active
 * sittings on three separate days (Tue/Wed/Thu), so that heuristic clipped
 * off the earliest day and silently dropped a real committee agenda. A
 * fixed trailing calendar week is simpler and doesn't have that failure
 * mode; each day's listing fetch is cheap and empty days short-circuit
 * immediately, so scanning the full week costs little.
 */
import type { Item } from "../types";
import { fetchText } from "./fetch-utils";

const BASE = "https://titania.saeima.lv/livs/saeimasnotikumi.nsf";
const DAYS_BACK = 7;
const MAX_COMMITTEES_PER_DAY = 15;

function formatLvDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}

interface DayEntry {
  title: string;
  time: string;
  unid: string;
}

function parseDayListing(html: string): DayEntry[] {
  const entries: DayEntry[] = [];
  const re = /draw_PE\(\{([\s\S]*?)\}\)/g;
  for (const m of html.matchAll(re)) {
    const body = m[1];
    const get = (key: string) => body.match(new RegExp(`${key}:"([^"]*)"`))?.[1] ?? "";
    const unid = get("unid");
    const title = get("title");
    const time = get("time");
    if (unid && title) entries.push({ title, time, unid });
  }
  return entries;
}

const AGENDA_ITEM_RE = /<b><font size="4"[^>]*>(\d{1,2})\.\s*<\/font><\/b>/g;

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n).trim() + "…" : s;
}

/** Title display should end before the "Uzaicināti:" (invited) list — that
 * list is valuable in the scoring `text` field (an invited stakeholder is a
 * relevance signal) but reads badly mid-sentence in a card title. */
function titleSnippet(s: string, n: number): string {
  const cut = s.split(/\s*Uzaicināti\s*:/i)[0];
  return truncate(cut, n);
}

interface AgendaPoint {
  n: string;
  text: string;
  billNr?: string;
}

function extractAgendaPoints(detailHtml: string): AgendaPoint[] {
  const bodyIdx = detailHtml.indexOf('id="textBody"');
  if (bodyIdx === -1) return [];
  const body = detailHtml.slice(bodyIdx, bodyIdx + 40_000);

  const starts: { index: number; n: string }[] = [];
  for (const m of body.matchAll(AGENDA_ITEM_RE)) {
    starts.push({ index: m.index!, n: m[1] });
  }

  const points: AgendaPoint[] = [];
  for (let i = 0; i < starts.length; i++) {
    const begin = starts[i].index;
    // Bound the final item (no following marker) so we don't sweep up
    // trailing attachment filenames and page chrome.
    const end = i + 1 < starts.length ? starts[i + 1].index : begin + 3000;
    const raw = body.slice(begin, end);
    const text = stripTags(raw).replace(/^\d{1,2}\.\s*/, "");
    if (!text) continue;
    const billNr = raw.match(/restricttocategory=([\d]+\/Lp\d+)/)?.[1];
    points.push({ n: starts[i].n, text: truncate(text, 700), billNr });
  }
  return points;
}

export async function collectSaeimaCommittees(): Promise<Item[]> {
  const items: Item[] = [];
  const today = new Date();

  for (let back = 0; back < DAYS_BACK; back++) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - back);
    const lvDate = formatLvDate(day);

    let listingHtml: string;
    try {
      listingHtml = await fetchText(
        `${BASE}/webComisDK?OpenView&count=1000&restricttocategory=${lvDate}`,
      );
    } catch {
      continue;
    }
    const entries = parseDayListing(listingHtml).slice(0, MAX_COMMITTEES_PER_DAY);
    if (entries.length === 0) continue;

    const isoDate = new Date(
      Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()),
    ).toISOString();

    const details = await Promise.allSettled(
      entries.map((e) => fetchText(`${BASE}/0/${e.unid}?OpenDocument`)),
    );

    entries.forEach((entry, i) => {
      const result = details[i];
      const detailUrl = `${BASE}/0/${entry.unid}?OpenDocument`;
      if (result.status !== "fulfilled") {
        items.push({
          id: `saeima_committees:${entry.unid}`,
          source: "saeima_committees",
          sourceLabel: "Saeima — komisiju sēdes",
          title: entry.title,
          url: detailUrl,
          date: isoDate,
        });
        return;
      }
      const points = extractAgendaPoints(result.value);
      if (points.length === 0) {
        items.push({
          id: `saeima_committees:${entry.unid}`,
          source: "saeima_committees",
          sourceLabel: "Saeima — komisiju sēdes",
          title: entry.title,
          url: detailUrl,
          date: isoDate,
          stage: entry.title,
        });
        return;
      }
      for (const p of points) {
        items.push({
          id: `saeima_committees:${entry.unid}:${p.n}`,
          source: "saeima_committees",
          sourceLabel: "Saeima — komisiju sēdes",
          title: `${entry.title}: ${titleSnippet(p.text, 160)}`,
          url: detailUrl,
          date: isoDate,
          stage: p.billNr ? `${entry.title} (${p.billNr})` : entry.title,
          text: p.text,
        });
      }
    });
  }
  return items;
}
