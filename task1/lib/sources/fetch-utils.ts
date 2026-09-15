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

/**
 * Per-attempt timeout, retry count and the hard ceiling for one fetchText
 * call including backoff. The ceiling exists because run.ts kills a whole
 * source at PER_SOURCE_TIMEOUT_MS: previously one fetchText could burn
 * 10s x 3 attempts + backoff (~31s) against a 20s source budget, so the
 * final retry was mathematically unable to finish — it only ever fired
 * under exactly the slow-server conditions it was added for, and was then
 * killed mid-flight. Two attempts that can both actually complete beat
 * three where the last is guaranteed to be cut off.
 *
 * Worst case now: 8s + ~0.8s backoff + 8s = ~16.8s, inside MAX_FETCH_BUDGET_MS,
 * which is itself inside run.ts's 20s per-source timeout. tests/fetch-utils
 * asserts that ordering so the two can't silently drift apart again.
 */
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_RETRIES = 1;
const RETRY_BASE_DELAY_MS = 400;
export const MAX_FETCH_BUDGET_MS = 18_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Jittered exponential backoff: retryable network errors, 429 and 5xx only.
 * A 4xx other than 429 means the request itself is wrong — retrying it wastes
 * a government server's time for no benefit, so it's excluded on purpose. */
function isRetryable(err: unknown): boolean {
  if (err instanceof SourceTimeoutError) return true;
  if (err instanceof SourceFetchError) {
    // Read the structured status, never the message: the message is
    // presentation and reformatting it used to silently change retry
    // behaviour.
    if (err.status === undefined) return true; // transport failure (DNS, reset)
    return err.status === 429 || err.status >= 500;
  }
  return false;
}

export class SourceFetchError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly cause?: unknown,
    /** HTTP status when the request completed with one; undefined for a
     * transport-level failure (DNS, connection reset, abort). */
    public readonly status?: number,
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

/**
 * The F5 WAF in front of tapportals returns its rejection page with HTTP 200,
 * so it parses as a legitimately empty result unless detected explicitly.
 * Matching had to stop using startsWith: a leading BOM or any whitespace in
 * front of the doctype defeated it, and that is precisely the case this check
 * exists to catch.
 */
export function looksLikeWafRejection(body: string): boolean {
  const head = body.replace(/^﻿/, "").trimStart().slice(0, 400).toLowerCase();
  return head.includes("<title>request rejected") || head.includes("the requested url was rejected");
}

async function fetchTextOnce(url: string, init: RequestInit, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Honour a caller-supplied signal as well as our own timeout, so when the
  // orchestrator gives up on a source the in-flight request is actually
  // cancelled rather than left running against a government server that we
  // have already stopped waiting for.
  const signal = init.signal
    ? AbortSignal.any([controller.signal, init.signal])
    : controller.signal;
  try {
    const res = await fetch(url, {
      ...init,
      signal,
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
        undefined,
        res.status,
      );
    }
    if (!res.ok) {
      throw new SourceFetchError(`HTTP ${res.status} from ${url}`, url, undefined, res.status);
    }
    return body;
  } catch (err) {
    if (err instanceof SourceFetchError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      // An external abort is the caller giving up, not a slow server —
      // don't dress it up as a timeout that retry logic would retry.
      if (init.signal?.aborted) {
        throw new SourceFetchError(`Aborted fetching ${url}`, url, err, undefined);
      }
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
  const deadline = Date.now() + MAX_FETCH_BUDGET_MS;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Never start an attempt that the budget can't let finish.
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    try {
      return await fetchTextOnce(url, init, Math.min(timeoutMs, remaining));
    } catch (err) {
      lastErr = err;
      if (init.signal?.aborted) throw err; // caller gave up; stop immediately
      if (attempt === MAX_RETRIES || !isRetryable(err)) throw err;
      const jitter = Math.random() * RETRY_BASE_DELAY_MS;
      const backoff = RETRY_BASE_DELAY_MS * 2 ** attempt + jitter;
      if (Date.now() + backoff >= deadline) throw err;
      await sleep(backoff);
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
