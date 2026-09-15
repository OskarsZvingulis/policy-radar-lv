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
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Jittered exponential backoff: retryable network errors, 429 and 5xx only.
 * A 4xx other than 429 means the request itself is wrong — retrying it wastes
 * a government server's time for no benefit, so it's excluded on purpose. */
function isRetryable(err: unknown): boolean {
  if (err instanceof SourceTimeoutError) return true;
  if (err instanceof SourceFetchError) {
    const status = err.message.match(/^HTTP (\d+)/)?.[1];
    if (status) return status === "429" || status.startsWith("5");
    // No HTTP status parsed at all means the fetch itself failed
    // (DNS/connection reset/etc.) — also worth one retry.
    return !err.message.startsWith("HTTP");
  }
  return false;
}

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

async function fetchTextOnce(url: string, init: RequestInit, timeoutMs: number): Promise<string> {
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

export async function fetchText(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchTextOnce(url, init, timeoutMs);
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_RETRIES || !isRetryable(err)) throw err;
      const jitter = Math.random() * RETRY_BASE_DELAY_MS;
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt + jitter);
    }
  }
  throw lastErr;
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

// Application/registration verbs that must appear near a "līdz DD. month"
// phrase for it to count as a deadline. Without this, the same phrasing used
// for "no 14. līdz 17. septembrim ... delegācija ... tirdzniecības misijā"
// (a trade mission's travel dates — verified as a real false positive
// against the live EM feed) would misread an event's date range as
// something you can still apply to.
const APPLICATION_CONTEXT = /pieteik|reģistrē|iesniegt|aicina/i;
const PROXIMITY_CHARS = 120;

/**
 * Extract a "līdz DD. mēnesis" (until DD month) deadline from free text —
 * the phrasing LIAA/Altum/EM use in prose for application and consultation
 * windows ("No 9. līdz 24. septembrim ... aicina piesakīties"), which never
 * appears as a structured field the way TAP's deadline column does. Only
 * counted when an application/registration verb appears within the same
 * sentence-ish window — the identical date-range phrasing is also used for
 * plain event duration ("delegation travels 14 to 17 September"), which is
 * not a deadline. Anchored to the item's own publish year; if the resulting
 * date falls more than ~60 days before publication it is assumed to roll
 * into the following year (a December post referencing a January close).
 * Returns undefined — never a guess — when nothing matches, so an item
 * without this phrasing simply keeps showing its publish date instead of a
 * fabricated deadline.
 */
export function extractDeadlinePhrase(text: string, publishedIso: string): string | undefined {
  const re = /līdz\s+(\d{1,2})\.\s*([A-Za-zĀ-ž]+)/gi;
  let match: RegExpExecArray | null;
  let last: { day: number; month: number } | undefined;
  while ((match = re.exec(text))) {
    const month = lvMonthNumber(match[2]);
    if (!month) continue;
    const windowStart = Math.max(0, match.index - PROXIMITY_CHARS);
    const windowEnd = Math.min(text.length, match.index + match[0].length + PROXIMITY_CHARS);
    if (APPLICATION_CONTEXT.test(text.slice(windowStart, windowEnd))) {
      last = { day: Number(match[1]), month };
    }
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
