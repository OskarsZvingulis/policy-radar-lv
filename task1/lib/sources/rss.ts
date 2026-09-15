/**
 * Ekonomikas ministrija, LIAA and Altum all turn out to publish a standard
 * RSS 2.0 feed (EM/LIAA at /lv/rss/articles, Altum's default WordPress
 * /feed/) — no need for three separate HTML scrapers, one parser covers all
 * three, config-driven.
 */
import { XMLParser } from "fast-xml-parser";
import type { Item, SourceId } from "../types";
import { fetchText, extractDeadlinePhrase, htmlToText } from "./fetch-utils";
import { logger } from "../logging";

interface RssConfig {
  source: SourceId;
  label: string;
  feedUrl: string;
}

const CONFIGS: RssConfig[] = [
  { source: "em_news", label: "Ekonomikas ministrija", feedUrl: "https://www.em.gov.lv/lv/rss/articles" },
  { source: "liaa_news", label: "LIAA", feedUrl: "https://www.liaa.gov.lv/lv/rss/articles" },
  { source: "altum_news", label: "Altum", feedUrl: "https://www.altum.lv/feed/" },
];

const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

async function collectOne(cfg: RssConfig, signal?: AbortSignal): Promise<Item[]> {
  const xml = await fetchText(cfg.feedUrl, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
    signal,
  });
  const parsed = parser.parse(xml);
  const rawItems = toArray(parsed?.rss?.channel?.item);

  return rawItems.map((it, idx): Item => {
    // Only http(s) links are ever carried forward. A feed is third-party
    // markup, and the URL ends up in an href in three renderers.
    const rawLink = String(it.link ?? "").trim();
    const link = /^https?:\/\//i.test(rawLink) ? rawLink : "";
    if (rawLink && !link) {
      logger.warn("dropped a non-http link from an RSS item", {
        source: cfg.source,
        stage: "collect",
        error: rawLink.slice(0, 120),
      });
    }

    const title = htmlToText(String(it.title ?? ""));
    const { date: pubDate, approximate } = parsePubDate(it.pubDate, cfg, link);
    const description = it.description ? htmlToText(String(it.description)) : "";
    // EM/LIAA/Altum have no structured deadline field, but a support-programme
    // announcement usually states its own window in prose ("No 9. līdz 24.
    // septembrim ... aicina pieteikties"). Extract it when present rather than
    // let a genuine, currently-open application window show as a plain
    // "Published" date with no actionability at all.
    const deadline = extractDeadlinePhrase(`${title} ${description}`, pubDate);
    return {
      id: `${cfg.source}:${stableId(it, link, idx)}`,
      source: cfg.source,
      sourceLabel: cfg.label,
      title,
      url: link,
      date: pubDate,
      dateIsApproximate: approximate || undefined,
      deadline,
      text: description,
    };
  });
}

/**
 * A feed's own guid is the only identifier that survives a link changing.
 * The list index is the last resort, and is unstable by nature: it shifts the
 * moment the publisher inserts an item, which silently re-keys everything
 * downstream (dedupe, the LLM explanation cache).
 */
function stableId(it: Record<string, unknown>, link: string, idx: number): string {
  const guid = it.guid;
  const raw = typeof guid === "object" && guid !== null ? (guid as { "#text"?: unknown })["#text"] : guid;
  const text = raw === undefined || raw === null ? "" : String(raw).trim();
  return text || link || String(idx);
}

/**
 * One unparseable date used to throw, and because the whole feed is mapped in
 * a single pass, that took down all of Altum/EM/LIAA with it: the source
 * reported "failed" with zero items over one malformed field. Now the item
 * keeps its place with the scrape time, flagged approximate so nothing
 * downstream reads it as a real publication date.
 */
function parsePubDate(
  raw: unknown,
  cfg: RssConfig,
  link: string,
): { date: string; approximate: boolean } {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { date: new Date().toISOString(), approximate: true };
  }
  const parsed = new Date(String(raw));
  if (Number.isNaN(parsed.getTime())) {
    logger.warn("unparseable pubDate in RSS item, using scrape time", {
      source: cfg.source,
      stage: "collect",
      error: `${String(raw).slice(0, 60)} (${link || "no link"})`,
    });
    return { date: new Date().toISOString(), approximate: true };
  }
  return { date: parsed.toISOString(), approximate: false };
}

export async function collectEmNews(signal?: AbortSignal): Promise<Item[]> {
  return collectOne(CONFIGS[0], signal);
}

export async function collectLiaaNews(signal?: AbortSignal): Promise<Item[]> {
  return collectOne(CONFIGS[1], signal);
}

export async function collectAltumNews(signal?: AbortSignal): Promise<Item[]> {
  return collectOne(CONFIGS[2], signal);
}
