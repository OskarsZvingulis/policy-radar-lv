/**
 * Shared fetch helper for all collectors.
 *
 * Encodes two things learned by probing the live sources:
 *  - tapportals.mk.gov.lv sits behind an F5 WAF that rejects any query string
 *    containing `[]=` (JSON:API array params, even percent-encoded) with an
 *    HTTP 200 whose body is an F5 "Request Rejected" HTML page. That is a
 *    failure, not a valid empty response — detect it explicitly.
 *  - every collector must be bounded so a single slow government server can't
 *    hang the whole digest run (the run needs to finish in well under a
 *    minute so a screen recording stays inside its time budget).
 */

const DEFAULT_TIMEOUT_MS = 10_000;

export class SourceFetchError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "SourceFetchError";
  }
}

export class SourceTimeoutError extends SourceFetchError {
  constructor(url: string) {
    super(`Timed out fetching ${url}`, url);
    this.name = "SourceTimeoutError";
  }
}

function looksLikeWafRejection(body: string): boolean {
  return body.startsWith("<html><head><title>Request Rejected");
}

export async function fetchText(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "PolicyRadarLV/0.1 (startup policy digest prototype)",
        ...init.headers,
      },
    });
    const body = await res.text();

    if (looksLikeWafRejection(body)) {
      throw new SourceFetchError(
        "WAF rejected request (query string likely contains an unsupported pattern like [])",
        url,
      );
    }
    if (!res.ok) {
      throw new SourceFetchError(`HTTP ${res.status} from ${url}`, url);
    }
    return body;
  } catch (err) {
    if (err instanceof SourceFetchError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new SourceTimeoutError(url);
    }
    throw new SourceFetchError(`Fetch failed for ${url}: ${String(err)}`, url, err);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const text = await fetchText(
    url,
    { ...init, headers: { Accept: "application/vnd.api+json", ...init.headers } },
    timeoutMs,
  );
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new SourceFetchError(`Invalid JSON from ${url}: ${String(err)}`, url, err);
  }
}

/** Strip HTML tags and decode the small set of entities gov.lv sites use. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&sect;/g, "§")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse Latvian dd.mm.yyyy dates into an ISO date string (UTC midnight). */
export function parseLvDate(s: string): string | undefined {
  const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return undefined;
  const [, d, mo, y] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).toISOString();
}


const LV_MONTHS: [RegExp, number][] = [
  [/janvār/i, 1], [/februār/i, 2], [/^mart/i, 3], [/aprīl/i, 4],
  [/maij/i, 5], [/jūnij/i, 6], [/jūlij/i, 7], [/august/i, 8],
  [/septembr/i, 9], [/oktobr/i, 10], [/novembr/i, 11], [/decembr/i, 12],
];

function lvMonthNumber(word: string): number | undefined {
  for (const [re, n] of LV_MONTHS) if (re.test(word)) return n;
  return undefined;
}

/**
 * Extract a "līdz DD. mēnesis" (until DD month) deadline from free text —
 * the phrasing LIAA/Altum/EM use in prose for application and consultation
 * windows ("No 9. līdz 24. septembrim ... aicina piesakīties"), which never
 * appears as a structured field the way TAP's deadline column does. Anchored
 * to the item's own publish year; if the resulting date falls more than ~60
 * days before publication it is assumed to roll into the following year (a
 * December post referencing a January close). Returns undefined — never a
 * guess — when nothing matches, so an item without this phrasing simply
 * keeps showing its publish date instead of a fabricated deadline.
 */
export function extractDeadlinePhrase(text: string, publishedIso: string): string | undefined {
  const re = /līdz\s+(\d{1,2})\.\s*([A-Za-zĀ-ž]+)/gi;
  let match: RegExpExecArray | null;
  let last: { day: number; month: number } | undefined;
  while ((match = re.exec(text))) {
    const month = lvMonthNumber(match[2]);
    if (month) last = { day: Number(match[1]), month };
  }
  if (!last) return undefined;

  const published = new Date(publishedIso);
  if (Number.isNaN(published.getTime())) return undefined;
  let year = published.getUTCFullYear();
  let candidate = Date.UTC(year, last.month - 1, last.day);
  if (candidate < published.getTime() - 60 * 86_400_000) {
    year += 1;
    candidate = Date.UTC(year, last.month - 1, last.day);
  }
  return new Date(candidate).toISOString();
}
