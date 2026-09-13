/**
 * Ekonomikas ministrija, LIAA and Altum all turn out to publish a standard
 * RSS 2.0 feed (EM/LIAA at /lv/rss/articles, Altum's default WordPress
 * /feed/) — no need for three separate HTML scrapers, one parser covers all
 * three, config-driven.
 */
import { XMLParser } from "fast-xml-parser";
import type { Item, SourceId } from "../types";
import { fetchText, extractDeadlinePhrase } from "./fetch-utils";

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

async function collectOne(cfg: RssConfig): Promise<Item[]> {
  const xml = await fetchText(cfg.feedUrl, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
  });
  const parsed = parser.parse(xml);
  const rawItems = toArray(parsed?.rss?.channel?.item);

  return rawItems.map((it, idx): Item => {
    const link = String(it.link ?? "").trim();
    const title = String(it.title ?? "").trim();
    const pubDate = it.pubDate ? new Date(String(it.pubDate)).toISOString() : new Date().toISOString();
    const description = it.description ? String(it.description).replace(/<[^>]+>/g, " ").trim() : "";
    // EM/LIAA/Altum have no structured deadline field, but a support-programme
    // announcement usually states its own window in prose ("No 9. līdz 24.
    // septembrim ... aicina pieteikties"). Extract it when present rather than
    // let a genuine, currently-open application window show as a plain
    // "Published" date with no actionability at all.
    const deadline = extractDeadlinePhrase(`${title} ${description}`, pubDate);
    return {
      id: `${cfg.source}:${link || idx}`,
      source: cfg.source,
      sourceLabel: cfg.label,
      title,
      url: link,
      date: pubDate,
      deadline,
      text: description,
    };
  });
}

export async function collectEmNews(): Promise<Item[]> {
  return collectOne(CONFIGS[0]);
}

export async function collectLiaaNews(): Promise<Item[]> {
  return collectOne(CONFIGS[1]);
}

export async function collectAltumNews(): Promise<Item[]> {
  return collectOne(CONFIGS[2]);
}
